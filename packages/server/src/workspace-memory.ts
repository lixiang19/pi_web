import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
	AuthStorage,
	createAgentSession as realCreateAgentSession,
	ModelRegistry,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { createBackgroundJobQueue } from "./background-jobs.js";
import {
	createPiDefaultAuthStorage,
	createPiDefaultModelRegistry,
} from "./pi-default-config.js";
import type { ThinkingLevel } from "./types/index.js";
import { toPosixPath } from "./utils/paths.js";
import { normalizeString } from "./utils/strings.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

interface PromptableSession {
	prompt(prompt: string, options?: unknown): Promise<void> | void;
	messages: Array<{ role: string; content: unknown }>;
}

interface ShutdownableSessionManager {
	shutdown?: () => Promise<void> | void;
}

export interface CreateAgentSessionOptions {
	cwd: string;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	noTools: "all" | "builtin";
	sessionManager: ShutdownableSessionManager;
	model?: Model<Api>;
	thinkingLevel?: ThinkingLevel;
}

export type CreateAgentSessionFn = (
	options: CreateAgentSessionOptions,
) => Promise<{ session: PromptableSession; extensionsResult: unknown }>;

export interface EnqueueSessionSummaryInput {
	sessionId: string;
	sessionFile: string;
	title: string;
	cwd: string;
	workspaceDir: string;
	endedAt?: number;
	projectLabel?: string;
	projectRoot?: string;
}

interface SummaryJobPayload extends EnqueueSessionSummaryInput {
	dailyDate: string;
	dailyYear: string;
	dailyMonth: string;
	dailyTime: string;
}

interface SummaryResult {
	title: string;
	summary: string;
	atoms: SummaryAtomInput[];
	artifacts: string[];
}

type MemoryAtomType = "preference" | "decision" | "constraint" | "lesson" | "fact" | "workflow";
type MemoryAtomConfidence = "explicit" | "inferred";

interface SummaryAtomInput {
	type: MemoryAtomType;
	scope: string;
	confidence: MemoryAtomConfidence;
	evidence: string;
	content: string;
}

interface CompletedMemoryAtom extends SummaryAtomInput {
	id: string;
	status: "active";
	observedAt: string;
	sourceSessionId: string;
}

interface MemoryMaintainResult {
	scenarios: ScenarioUpdate[];
	memories: MemoryEntryInput[];
}

interface ScenarioAtomRef {
	id: string;
	date: string;
	note: string;
}

interface ScenarioUpdate {
	slug: string;
	title: string;
	conclusions: string[];
	atomRefs: ScenarioAtomRef[];
	superseded: string[];
}

interface MemoryEntryInput {
	scope: string;
	date: string;
	content: string;
}

export interface WorkspaceMemoryWorkersOptions {
	jobQueue: BackgroundJobQueue;
	workspaceDir: string;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	pollIntervalMs?: number;
	now?: () => number;
	createAgentSessionFn?: CreateAgentSessionFn;
	sessionManagerFactory?: (workspaceDir: string) => ShutdownableSessionManager;
	resolveBackgroundModel?: () => Promise<string | undefined> | string | undefined;
	resolveBackgroundThinkingLevel?: () => Promise<ThinkingLevel | undefined> | ThinkingLevel | undefined;
}

const MEMORY_HEADER = "# MEMORY\n";
const WIKI_HEADER = "# Wiki\n";
const MAX_TRANSCRIPT_CHARS = 32_000;
const MAX_MEMORY_CHARS = 4_000;
const MAX_MEMORY_LINES = 40;
const MAX_SCENARIO_CONTEXT_CHARS = 16_000;
const SENSITIVE_PATTERN =
	/(token|api[_-]?key|apikey|password|passwd|secret|private key|私钥|密码|密钥|令牌|sk-[a-z0-9_-]{8,})/i;
const MEMORY_ATOM_TYPES = new Set<MemoryAtomType>([
	"preference",
	"decision",
	"constraint",
	"lesson",
	"fact",
	"workflow",
]);
const MEMORY_ATOM_CONFIDENCES = new Set<MemoryAtomConfidence>(["explicit", "inferred"]);
const MEMORY_SCOPE_PATTERN = /^(global|pi_web|module:[a-z0-9_-]+|task:[a-z0-9_-]+|repo:[a-z0-9_-]+)$/i;
const MEMORY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEMORY_ATOM_ID_PATTERN = /^mem_\d{8}_\d{4}_\d{3}$/;
const SCENARIO_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/i;

const pad2 = (value: number) => String(value).padStart(2, "0");

const localDateParts = (timestamp: number) => {
	const date = new Date(timestamp);
	return {
		year: String(date.getFullYear()),
		month: pad2(date.getMonth() + 1),
		day: pad2(date.getDate()),
		hour: pad2(date.getHours()),
		minute: pad2(date.getMinutes()),
	};
};

const formatLocalIso = (timestamp: number): string => {
	const date = new Date(timestamp);
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absoluteOffset = Math.abs(offsetMinutes);
	return [
		`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
		"T",
		`${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
		sign,
		`${pad2(Math.floor(absoluteOffset / 60))}:${pad2(absoluteOffset % 60)}`,
	].join("");
};

export const buildDailyInfo = (timestamp: number) => {
	const parts = localDateParts(timestamp);
	const dailyDate = `${parts.year}-${parts.month}-${parts.day}`;
	return {
		dailyDate,
		dailyYear: parts.year,
		dailyMonth: parts.month,
		dailyTime: `${parts.hour}:${parts.minute}`,
	};
};

const dailyFilePath = (workspaceDir: string, payload: Pick<SummaryJobPayload, "dailyDate" | "dailyYear" | "dailyMonth">) =>
	path.join(
		workspaceDir,
		"记忆",
		"daily",
		payload.dailyYear,
		payload.dailyMonth,
		`${payload.dailyDate}.md`,
	);

const ensureMemoryFile = async (workspaceDir: string) => {
	const filePath = path.join(workspaceDir, "记忆", "MEMORY.md");
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	try {
		await fs.access(filePath);
	} catch {
		await fs.writeFile(filePath, MEMORY_HEADER, "utf8");
	}
	return filePath;
};

const ensureWikiFile = async (workspaceDir: string) => {
	const filePath = path.join(workspaceDir, "Wiki", "index.md");
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	try {
		await fs.access(filePath);
	} catch {
		await fs.writeFile(filePath, WIKI_HEADER, "utf8");
	}
	return filePath;
};

const stripTopHeading = (content: string, heading: string) => {
	const normalized = content.replace(/\r\n/g, "\n").trim();
	const headingLine = heading.trim();
	if (!normalized) return "";
	if (normalized === headingLine) return "";
	if (normalized.startsWith(`${headingLine}\n`)) {
		return normalized.slice(headingLine.length).trim();
	}
	return normalized;
};

const readTextFileIfExists = async (filePath: string): Promise<string> => {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch {
		return "";
	}
};

const readTextFileIfExistsSync = (filePath: string): string => {
	try {
		return readFileSync(filePath, "utf8");
	} catch {
		return "";
	}
};

export const buildWorkspaceMemoryInjection = async (
	workspaceDir: string,
): Promise<string> => {
	const memoryPath = await ensureMemoryFile(workspaceDir);
	const wikiPath = await ensureWikiFile(workspaceDir);
	const memory = stripTopHeading(await readTextFileIfExists(memoryPath), MEMORY_HEADER);
	const wiki = stripTopHeading(await readTextFileIfExists(wikiPath), WIKI_HEADER);
	return formatWorkspaceMemoryInjection(memory, wiki);
};

export const buildWorkspaceMemoryInjectionSync = (workspaceDir: string): string => {
	const memoryPath = path.join(workspaceDir, "记忆", "MEMORY.md");
	const wikiPath = path.join(workspaceDir, "Wiki", "index.md");
	const memory = stripTopHeading(readTextFileIfExistsSync(memoryPath), MEMORY_HEADER);
	const wiki = stripTopHeading(readTextFileIfExistsSync(wikiPath), WIKI_HEADER);
	return formatWorkspaceMemoryInjection(memory, wiki);
};

const formatWorkspaceMemoryInjection = (memory: string, wiki: string): string => {
	const sections: string[] = [];
	const reminder = "记忆可能过时，当前用户最新话语和当前文件事实优先。";
	if (memory.trim()) {
		sections.push(`<ridge_memory>\n${reminder}\n${memory.trim()}\n</ridge_memory>`);
	}
	if (wiki.trim()) {
		sections.push(`<ridge_wiki_index>\n${reminder}\n${wiki.trim()}\n</ridge_wiki_index>`);
	}
	return sections.join("\n\n");
};

const normalizeMemoryLine = (value: string): string => {
	const normalized = normalizeString(value)
		.replace(/^[-*]\s*/, "")
		.replace(/^记住[:：]?\s*/, "")
		.trim();
	if (!normalized) return "";
	return normalized.endsWith("。") || normalized.endsWith(".")
		? normalized
		: `${normalized}。`;
};

const isSensitiveMemory = (value: string) => SENSITIVE_PATTERN.test(value);

const readMemoryLines = async (workspaceDir: string): Promise<string[]> => {
	const filePath = await ensureMemoryFile(workspaceDir);
	const content = await fs.readFile(filePath, "utf8");
	return stripTopHeading(content, MEMORY_HEADER)
		.split(/\r?\n/)
		.map((line) => normalizeMemoryLine(line))
		.filter(Boolean);
};

const writeMemoryLines = async (workspaceDir: string, lines: string[]) => {
	const filePath = await ensureMemoryFile(workspaceDir);
	const unique = [...new Set(lines.map(normalizeMemoryLine).filter(Boolean))]
		.filter((line) => !isSensitiveMemory(line))
		.slice(0, MAX_MEMORY_LINES);
	let content = `${MEMORY_HEADER}`;
	if (unique.length > 0) {
		content += `\n${unique.map((line) => `- ${line}`).join("\n")}\n`;
	}
	await fs.writeFile(filePath, content, "utf8");
};

const extractExplicitMemoryCommand = (
	text: string,
): { action: "remember" | "forget"; value: string } | null => {
	const normalized = normalizeString(text);
	const forget = normalized.match(/(?:忘掉|别再记(?:住)?|不要再记(?:住)?)(?:[:：]|\s)+(.*)$/);
	if (forget?.[1]) {
		return { action: "forget", value: forget[1].trim() };
	}
	const remember = normalized.match(/(?:记住|请记住)(?:[:：]|\s)+(.*)$/);
	if (remember?.[1]) {
		return { action: "remember", value: remember[1].trim() };
	}
	return null;
};

export const applyExplicitMemoryCommand = async (
	workspaceDir: string,
	userText: string,
): Promise<boolean> => {
	const command = extractExplicitMemoryCommand(userText);
	if (!command) return false;
	const value = normalizeMemoryLine(command.value);
	if (!value) return false;

	const existing = await readMemoryLines(workspaceDir);
	if (command.action === "remember") {
		if (isSensitiveMemory(value)) return false;
		const datedValue = formatMemoryEntry({
			scope: "global",
			date: buildDailyInfo(Date.now()).dailyDate,
			content: value,
		});
		await writeMemoryLines(workspaceDir, [datedValue, ...existing.filter((line) => line !== datedValue)]);
		return true;
	}

	const forgetNeedle = value.replace(/[。.]$/, "").toLowerCase();
	await writeMemoryLines(
		workspaceDir,
		existing.filter((line) => !line.toLowerCase().includes(forgetNeedle)),
	);
	return true;
};

const extractTextParts = (content: unknown): string[] => {
	if (typeof content === "string") {
		return [content];
	}
	if (!Array.isArray(content)) {
		return [];
	}
	return content
		.map((item) => {
			if (!item || typeof item !== "object") return "";
			const typed = item as { type?: unknown; text?: unknown; thinking?: unknown };
			if (typed.type === "text" && typeof typed.text === "string") {
				return typed.text;
			}
			if (typed.type === "thinking" && typeof typed.thinking === "string") {
				return typed.thinking;
			}
			return "";
		})
		.filter(Boolean);
};

const messageToText = (message: AgentMessage | { role: string; content: unknown }) => {
	if (!("content" in message) || typeof message.role !== "string") {
		return "";
	}
	const text = extractTextParts(message.content).join("\n").trim();
	return text ? `${message.role}: ${text}` : "";
};

const getLastAssistantText = (session: PromptableSession): string => {
	for (let index = session.messages.length - 1; index >= 0; index -= 1) {
		const message = session.messages[index];
		if (message?.role !== "assistant") continue;
		const text = extractTextParts(message.content).join("\n").trim();
		if (text) return text;
	}
	return "";
};

const readStoredSessionMessages = async (sessionFile: string): Promise<AgentMessage[]> => {
	const content = await fs.readFile(sessionFile, "utf8");
	const messages: AgentMessage[] = [];
	for (const line of content.split(/\r?\n/)) {
		if (!line.trim()) continue;
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (parsed.type !== "message") continue;
		const message = parsed.message;
		if (message && typeof message === "object") {
			messages.push(message as AgentMessage);
		}
	}
	return messages;
};

const extractJsonObject = (text: string): unknown => {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) {
		throw new Error("Agent response does not contain JSON");
	}
	return JSON.parse(match[0]) as unknown;
};

const normalizeStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value.map((item) => normalizeString(item)).filter(Boolean);
};

const parseSummaryAtoms = (value: unknown): SummaryAtomInput[] => {
	if (!Array.isArray(value)) return [];
	const atoms: SummaryAtomInput[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const data = item as Record<string, unknown>;
		const type = normalizeString(data.type) as MemoryAtomType;
		const confidence = normalizeString(data.confidence) as MemoryAtomConfidence;
		const scope = normalizeString(data.scope);
		const evidence = normalizeString(data.evidence);
		const content = normalizeString(data.content);
		if (
			!MEMORY_ATOM_TYPES.has(type) ||
			!MEMORY_ATOM_CONFIDENCES.has(confidence) ||
			!MEMORY_SCOPE_PATTERN.test(scope) ||
			!evidence ||
			!content
		) {
			continue;
		}
		if (isSensitiveMemory(`${evidence}\n${content}`)) continue;
		atoms.push({
			type,
			scope,
			confidence,
			evidence,
			content,
		});
	}
	return atoms;
};

const isPathWithin = (root: string, target: string): boolean => {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const stripLeadingDotSlash = (value: string): string => value.replace(/^\.?[\\/]+/, "");

const isExternalPayload = (payload: Pick<SummaryJobPayload, "workspaceDir" | "cwd" | "projectRoot">): boolean => {
	const projectRoot = normalizeString(payload.projectRoot) || payload.cwd;
	return !isPathWithin(payload.workspaceDir, projectRoot);
};

const normalizeArtifactPath = (artifact: string, payload: SummaryJobPayload): string => {
	const value = normalizeString(artifact);
	if (!value) return "";

	const projectRoot = path.resolve(normalizeString(payload.projectRoot) || payload.cwd);
	const projectLabel = normalizeString(payload.projectLabel) || path.basename(projectRoot);

	if (isExternalPayload(payload)) {
		if (value.startsWith(`${projectLabel}:`)) {
			return value;
		}
		if (path.isAbsolute(value)) {
			if (isPathWithin(projectRoot, value)) {
				const relative = stripLeadingDotSlash(toPosixPath(path.relative(projectRoot, value)));
				return relative ? `${projectLabel}: ${relative}` : projectLabel;
			}
			return `${projectLabel}: ${path.basename(value)}`;
		}
		return `${projectLabel}: ${stripLeadingDotSlash(toPosixPath(value))}`;
	}

	if (path.isAbsolute(value) && isPathWithin(payload.workspaceDir, value)) {
		return stripLeadingDotSlash(toPosixPath(path.relative(payload.workspaceDir, value)));
	}
	return stripLeadingDotSlash(toPosixPath(value));
};

const normalizeSummaryArtifacts = (
	result: SummaryResult,
	payload: SummaryJobPayload,
): SummaryResult => ({
	...result,
	artifacts: [
		...new Set(
			result.artifacts
				.map((artifact) => normalizeArtifactPath(artifact, payload))
				.filter(Boolean),
		),
	],
});

const parseSummaryResult = (raw: unknown): SummaryResult => {
	if (!raw || typeof raw !== "object") {
		throw new Error("Invalid summary result");
	}
	const data = raw as Record<string, unknown>;
	const title = normalizeString(data.title).slice(0, 80) || "未命名会话";
	const summary = normalizeString(data.summary);
	if (!summary) {
		throw new Error("Summary result missing summary");
	}
	return {
		title,
		summary,
		atoms: parseSummaryAtoms(data.atoms),
		artifacts: normalizeStringArray(data.artifacts),
	};
};

const parseMemoryMaintainResult = (raw: unknown): MemoryMaintainResult => {
	if (!raw || typeof raw !== "object") {
		throw new Error("Invalid memory result");
	}
	const data = raw as Record<string, unknown>;
	return {
		scenarios: parseScenarioUpdates(data.scenarios),
		memories: parseMemoryEntries(data.memories),
	};
};

const parseScenarioAtomRefs = (value: unknown): ScenarioAtomRef[] => {
	if (!Array.isArray(value)) return [];
	const refs: ScenarioAtomRef[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const data = item as Record<string, unknown>;
		const id = normalizeString(data.id);
		const date = normalizeString(data.date);
		const note = normalizeString(data.note);
		if (!MEMORY_ATOM_ID_PATTERN.test(id) || !MEMORY_DATE_PATTERN.test(date) || !note) {
			continue;
		}
		if (isSensitiveMemory(`${id}\n${date}\n${note}`)) continue;
		refs.push({ id, date, note });
	}
	return refs;
};

const parseScenarioUpdates = (value: unknown): ScenarioUpdate[] => {
	if (!Array.isArray(value)) return [];
	const scenarios: ScenarioUpdate[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const data = item as Record<string, unknown>;
		const slug = normalizeString(data.slug);
		const title = normalizeString(data.title);
		const conclusions = normalizeStringArray(data.conclusions).filter(
			(conclusion) => !isSensitiveMemory(conclusion),
		);
		const atomRefs = parseScenarioAtomRefs(data.atomRefs);
		const superseded = normalizeStringArray(data.superseded).filter(
			(item) => !isSensitiveMemory(item),
		);
		if (
			!SCENARIO_SLUG_PATTERN.test(slug) ||
			!title ||
			conclusions.length === 0 ||
			atomRefs.length === 0 ||
			isSensitiveMemory(`${title}\n${slug}`)
		) {
			continue;
		}
		scenarios.push({ slug, title, conclusions, atomRefs, superseded });
	}
	return scenarios;
};

const parseMemoryEntries = (value: unknown): MemoryEntryInput[] => {
	if (!Array.isArray(value)) return [];
	const entries: MemoryEntryInput[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const data = item as Record<string, unknown>;
		const scope = normalizeString(data.scope);
		const date = normalizeString(data.date);
		const content = normalizeString(data.content);
		if (
			!MEMORY_SCOPE_PATTERN.test(scope) ||
			!MEMORY_DATE_PATTERN.test(date) ||
			!content ||
			isSensitiveMemory(content)
		) {
			continue;
		}
		entries.push({ scope, date, content });
	}
	return entries;
};

const readScenarioContext = async (workspaceDir: string): Promise<string> => {
	const scenarioDir = path.join(workspaceDir, "记忆", "scenarios");
	let entries: Dirent[];
	try {
		entries = await fs.readdir(scenarioDir, { withFileTypes: true });
	} catch {
		return "";
	}
	const pages: string[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const slug = entry.name.slice(0, -3);
		if (!SCENARIO_SLUG_PATTERN.test(slug)) continue;
		const filePath = path.join(scenarioDir, entry.name);
		if (!isPathWithin(scenarioDir, filePath)) continue;
		const content = await readTextFileIfExists(filePath);
		if (content.trim()) {
			pages.push(`<!-- ${entry.name} -->\n${content.trim()}`);
		}
	}
	return pages.join("\n\n").slice(-MAX_SCENARIO_CONTEXT_CHARS);
};

const buildSummaryPrompt = (payload: SummaryJobPayload, messages: AgentMessage[]) => {
	const transcript = messages
		.map(messageToText)
		.filter(Boolean)
		.join("\n\n")
		.slice(-MAX_TRANSCRIPT_CHARS);
	const cwdRel = path.relative(payload.workspaceDir, payload.cwd);
	const cwdDescription =
		cwdRel && !cwdRel.startsWith("..")
			? `工作空间相对路径：${toPosixPath(cwdRel)}`
			: `外部项目：${payload.projectLabel || path.basename(payload.cwd)}，项目路径：${payload.cwd}`;
	return `你是 ridge 的 summary agent。只读取下面这一段会话记录，生成 daily 会话记忆条目。

要求：
- 只输出 JSON，不要解释。
- title 是一句短标题。
- summary 是一句短摘要。
- atoms 是结构化 L1 Atom 数组，每个 Atom 只表达一个事实、偏好、决策、约束或教训。
- Atom type 只能是 preference、decision、constraint、lesson、fact、workflow。
- Atom scope 只能是 global、pi_web、module:<name>、task:<id>、repo:<name>。
- Atom confidence 只能是 explicit 或 inferred。
- Atom evidence 必须是足够支撑 content 的用户原话或短证据。
- 临时操作、一次性命令、未确认推测、敏感信息不要写入 atoms。
- artifacts 是字符串数组。
- 工作空间产物写相对路径。
- 外部项目产物写项目名和项目内相对路径。
- 不生成单个会话摘要文件，不整理旧 daily。

会话：
- sessionId: ${payload.sessionId}
- 标题: ${payload.title}
- cwd: ${cwdDescription}

记录：
${transcript || "无可读消息"}

JSON 格式：
{"title":"","summary":"","atoms":[{"type":"decision","scope":"module:memory","confidence":"explicit","evidence":"","content":""}],"artifacts":[]}`;
};

const buildMemoryPrompt = (memory: string, daily: string, scenarios: string) => `你是 ridge 的 memory agent。请读取今天 daily 里的 L1 Atom、现有 Scenario 和当前 MEMORY，维护 L2 Scenario 与 L3 MEMORY。

要求：
- 只输出 JSON，不要解释。
- scenarios 是需要写入的场景页数组，slug 只能用小写英文、数字和连字符。
- Scenario 只写当前结论、依据 Atom 和历史覆盖；必须引用 atomRefs，不要产生无法追溯的新事实。
- memories 是当前应写入 MEMORY 的条目数组，每条必须包含 scope、date、content。
- 新近且明确的新结论覆盖旧弱结论。
- 删除旧弱记忆，让总量保持很短；MEMORY 不写完整证据，证据留在 L1。
- 不写 token、密码、私钥、密钥等敏感信息。
- 临时进度、一次性命令、刚改过的文件、短期调试结论不要进入 MEMORY。

当前 MEMORY:
${memory || "# MEMORY"}

现有 Scenario:
${scenarios || "无"}

今天 daily:
${daily || "无"}

JSON 格式：
{"scenarios":[{"slug":"conversation-memory","title":"对话记忆系统","conclusions":[],"atomRefs":[{"id":"mem_20260517_1032_001","date":"2026-05-17","note":""}],"superseded":[]}],"memories":[{"scope":"module:memory","date":"2026-05-17","content":""}]}`;

const runAgentJson = async (
	options: {
		workspaceDir: string;
		authStorage: AuthStorage;
		modelRegistry: ModelRegistry;
		createAgentSessionFn: CreateAgentSessionFn;
		sessionManagerFactory: (workspaceDir: string) => ShutdownableSessionManager;
		backgroundModel?: Model<Api>;
		backgroundThinkingLevel?: ThinkingLevel;
	},
	prompt: string,
): Promise<unknown> => {
	const sessionManager = options.sessionManagerFactory(options.workspaceDir);
	const { session } = await options.createAgentSessionFn({
		cwd: options.workspaceDir,
		authStorage: options.authStorage,
		modelRegistry: options.modelRegistry,
		noTools: "all",
		sessionManager,
		model: options.backgroundModel,
		thinkingLevel: options.backgroundThinkingLevel,
	});
	try {
		await session.prompt(prompt, { source: "interactive" });
		const response = getLastAssistantText(session);
		if (!response.trim()) {
			throw new Error("Empty response from memory agent");
		}
		return extractJsonObject(response);
	} finally {
		await sessionManager.shutdown?.();
	}
};

const resolveMaybe = async <T>(value: (() => Promise<T | undefined> | T | undefined) | undefined): Promise<T | undefined> =>
	typeof value === "function" ? await value() : undefined;

const resolveBackgroundModel = async (
	modelRegistry: ModelRegistry,
	modelSpec: string | undefined,
): Promise<Model<Api> | undefined> => {
	const normalized = normalizeString(modelSpec);
	if (!normalized) return undefined;
	const slashIndex = normalized.indexOf("/");
	if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
		return undefined;
	}
	modelRegistry.refresh();
	const provider = normalized.slice(0, slashIndex);
	const modelId = normalized.slice(slashIndex + 1);
	return modelRegistry.find(provider, modelId);
};

const formatListBlock = (items: string[]) =>
	items.length > 0
		? `\n${items.map((item) => `  - ${item}`).join("\n")}`
		: " 无";

const quoteMemoryValue = (value: string): string => JSON.stringify(value);

const completeSummaryAtoms = (
	payload: SummaryJobPayload,
	summary: SummaryResult,
): CompletedMemoryAtom[] => {
	const observedAt = formatLocalIso(payload.endedAt ?? Date.now());
	const datePart = payload.dailyDate.replaceAll("-", "");
	const timePart = payload.dailyTime.replace(":", "");
	return summary.atoms.map((atom, index) => ({
		...atom,
		id: `mem_${datePart}_${timePart}_${String(index + 1).padStart(3, "0")}`,
		status: "active",
		observedAt,
		sourceSessionId: payload.sessionId,
	}));
};

const formatAtomBlock = (atoms: CompletedMemoryAtom[]) => {
	if (atoms.length === 0) return "无";
	return atoms
		.map((atom) =>
			[
				`- id: ${atom.id}`,
				`  type: ${atom.type}`,
				`  scope: ${atom.scope}`,
				`  status: ${atom.status}`,
				`  confidence: ${atom.confidence}`,
				`  observedAt: ${atom.observedAt}`,
				`  sourceSessionId: ${atom.sourceSessionId}`,
				`  evidence: ${quoteMemoryValue(atom.evidence)}`,
				`  content: ${quoteMemoryValue(atom.content)}`,
			].join("\n"),
		)
		.join("\n\n");
};

const appendDailySummary = async (
	workspaceDir: string,
	payload: SummaryJobPayload,
	summary: SummaryResult,
) => {
	const filePath = dailyFilePath(workspaceDir, payload);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	let current = await readTextFileIfExists(filePath);
	if (!current.trim()) {
		current = `# ${payload.dailyDate}\n`;
	}
	const entry = [
		"",
		`## ${payload.dailyTime} ${payload.sessionId} ${summary.title}`,
		"",
		`- 摘要：${summary.summary}`,
		"",
		"### L1-Atom",
		"",
		formatAtomBlock(completeSummaryAtoms(payload, summary)),
		"",
		`- 产物：${formatListBlock(summary.artifacts)}`,
		"",
	].join("\n");
	await fs.writeFile(filePath, `${current.replace(/\s*$/, "\n")}${entry}`, "utf8");
};

const formatMemoryEntry = (entry: MemoryEntryInput): string =>
	normalizeMemoryLine(`[${entry.scope}][${entry.date}] ${entry.content}`);

const normalizeMaintainedMemory = (result: MemoryMaintainResult): string[] => {
	const lines = result.memories
		.map(formatMemoryEntry)
		.filter(Boolean)
		.filter((line) => !isSensitiveMemory(line));
	const unique = [...new Set(lines)];
	let total = 0;
	const kept: string[] = [];
	for (const line of unique) {
		if (kept.length >= MAX_MEMORY_LINES) break;
		const nextTotal = total + line.length + 3;
		if (nextTotal > MAX_MEMORY_CHARS) break;
		kept.push(line);
		total = nextTotal;
	}
	return kept;
};

const formatScenarioPage = (scenario: ScenarioUpdate) => {
	const sections = [
		`# ${scenario.title}`,
		"",
		"## 当前结论",
		"",
		...scenario.conclusions.map((conclusion) => `- ${conclusion}`),
		"",
		"## 依据 Atom",
		"",
		...scenario.atomRefs.map((ref) => `- \`${ref.id}\`：${ref.date} ${ref.note}`),
	];
	if (scenario.superseded.length > 0) {
		sections.push("", "## 历史覆盖", "", ...scenario.superseded.map((item) => `- ${item}`));
	}
	return `${sections.join("\n")}\n`;
};

const writeScenarioPages = async (workspaceDir: string, scenarios: ScenarioUpdate[]) => {
	const scenarioDir = path.join(workspaceDir, "记忆", "scenarios");
	await fs.mkdir(scenarioDir, { recursive: true });
	for (const scenario of scenarios) {
		const filePath = path.join(scenarioDir, `${scenario.slug}.md`);
		if (!isPathWithin(scenarioDir, filePath)) continue;
		await fs.writeFile(filePath, formatScenarioPage(scenario), "utf8");
	}
};

export const enqueueSessionSummaryJob = (
	jobQueue: BackgroundJobQueue,
	input: EnqueueSessionSummaryInput,
) => {
	const endedAt = input.endedAt ?? Date.now();
	const dailyInfo = buildDailyInfo(endedAt);
	return jobQueue.enqueue({
		type: "summary.daily",
		relatedType: "session",
		relatedId: input.sessionId,
		payload: {
			...input,
			...dailyInfo,
			endedAt,
		} satisfies SummaryJobPayload,
		maxAttempts: 3,
		notifyOnFailure: true,
	});
};

export function createWorkspaceMemoryWorkers(options: WorkspaceMemoryWorkersOptions): {
	processSummaryJob: () => Promise<void>;
	processMemoryJob: () => Promise<void>;
	start: () => void;
	stop: () => void;
} {
	const authStorage = options.authStorage ?? createPiDefaultAuthStorage();
	const modelRegistry =
		options.modelRegistry ?? createPiDefaultModelRegistry(authStorage);
	const createAgentSessionFn =
		options.createAgentSessionFn ??
		(realCreateAgentSession as unknown as CreateAgentSessionFn);
	const sessionManagerFactory =
		options.sessionManagerFactory ??
		((workspaceDir: string) => SessionManager.inMemory(workspaceDir) as ShutdownableSessionManager);
	const pollIntervalMs = options.pollIntervalMs ?? 5000;
	let running = false;
	let timer: NodeJS.Timeout | null = null;

	const processSummaryJob = async () => {
		const job = options.jobQueue.claimNext("summary-worker", "summary.daily");
		if (!job) return;
		const payload = job.payload as Partial<SummaryJobPayload> | null;
		if (!payload?.sessionId || !payload.sessionFile || !payload.dailyDate) {
			options.jobQueue.fail(job.jobId, new Error("Invalid summary job payload"));
			return;
		}

		try {
			const messages = await readStoredSessionMessages(payload.sessionFile);
			const prompt = buildSummaryPrompt(payload as SummaryJobPayload, messages);
			const backgroundModel = await resolveBackgroundModel(
				modelRegistry,
				await resolveMaybe(options.resolveBackgroundModel),
			);
			const backgroundThinkingLevel = await resolveMaybe(options.resolveBackgroundThinkingLevel);
			const raw = await runAgentJson(
				{
					workspaceDir: options.workspaceDir,
					authStorage,
					modelRegistry,
					createAgentSessionFn,
					sessionManagerFactory,
					backgroundModel,
					backgroundThinkingLevel,
				},
				prompt,
			);
			const result = normalizeSummaryArtifacts(
				parseSummaryResult(raw),
				payload as SummaryJobPayload,
			);
			await appendDailySummary(options.workspaceDir, payload as SummaryJobPayload, result);
			options.jobQueue.complete(job.jobId, {
				dailyDate: payload.dailyDate,
				sessionId: payload.sessionId,
			});
			options.jobQueue.enqueue({
				type: "memory.maintain",
				relatedType: "workspace",
				relatedId: options.workspaceDir,
				payload: {
					workspaceDir: options.workspaceDir,
					dailyDate: payload.dailyDate,
					dailyYear: payload.dailyYear,
					dailyMonth: payload.dailyMonth,
				},
				maxAttempts: 3,
				notifyOnFailure: true,
			});
		} catch (error) {
			options.jobQueue.fail(
				job.jobId,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	};

	const processMemoryJob = async () => {
		const job = options.jobQueue.claimNext("memory-worker", "memory.maintain");
		if (!job) return;
		const payload = job.payload as
			| { dailyDate?: string; dailyYear?: string; dailyMonth?: string }
			| null;
		if (!payload?.dailyDate || !payload.dailyYear || !payload.dailyMonth) {
			options.jobQueue.fail(job.jobId, new Error("Invalid memory job payload"));
			return;
		}
		try {
			const memoryPath = await ensureMemoryFile(options.workspaceDir);
			const currentMemory = await fs.readFile(memoryPath, "utf8");
			const daily = await readTextFileIfExists(
				dailyFilePath(options.workspaceDir, {
					dailyDate: payload.dailyDate,
					dailyYear: payload.dailyYear,
					dailyMonth: payload.dailyMonth,
				}),
			);
			const scenarios = await readScenarioContext(options.workspaceDir);
			const backgroundModel = await resolveBackgroundModel(
				modelRegistry,
				await resolveMaybe(options.resolveBackgroundModel),
			);
			const backgroundThinkingLevel = await resolveMaybe(options.resolveBackgroundThinkingLevel);
			const raw = await runAgentJson(
				{
					workspaceDir: options.workspaceDir,
					authStorage,
					modelRegistry,
					createAgentSessionFn,
					sessionManagerFactory,
					backgroundModel,
					backgroundThinkingLevel,
				},
				buildMemoryPrompt(currentMemory, daily, scenarios),
			);
			const result = parseMemoryMaintainResult(raw);
			await writeScenarioPages(options.workspaceDir, result.scenarios);
			const nextLines = normalizeMaintainedMemory(result);
			const currentLines = await readMemoryLines(options.workspaceDir);
			const changed = nextLines.join("\n") !== currentLines.join("\n");
			if (changed) {
				await writeMemoryLines(options.workspaceDir, nextLines);
			}
			options.jobQueue.complete(job.jobId, {
				changed,
				memoryCount: nextLines.length,
				scenarioCount: result.scenarios.length,
			});
		} catch (error) {
			options.jobQueue.fail(
				job.jobId,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	};

	const tick = async () => {
		if (!running) return;
		try {
			await processSummaryJob();
			await processMemoryJob();
		} catch (error) {
			console.error("Workspace memory worker error:", error);
		}
		if (running) {
			timer = setTimeout(tick, pollIntervalMs);
		}
	};

	const start = () => {
		if (running) return;
		running = true;
		void tick();
	};

	const stop = () => {
		running = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return {
		processSummaryJob,
		processMemoryJob,
		start,
		stop,
	};
}
