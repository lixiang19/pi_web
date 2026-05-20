import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import {
	complete as realComplete,
	type Api,
	type AssistantMessage,
	type Context,
	type Model,
	type ProviderStreamOptions,
} from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
	AuthStorage,
	createAgentSession as realCreateAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	type SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { createBackgroundJobQueue } from "./background-jobs.js";
import {
	createPiDefaultAuthStorage,
	createPiDefaultModelRegistry,
	createPiDefaultSettingsManager,
	getPiDefaultAgentDir,
} from "./pi-default-config.js";
import type { AgentPermission, ThinkingLevel } from "./types/index.js";
import { toPosixPath } from "./utils/paths.js";
import { normalizeString } from "./utils/strings.js";
import {
	compileAgentPermission,
	createPermissionGateExtension,
	loadGlobalPermissionConfig,
} from "./agent-permissions.js";
import {
	discoverAgents,
	normalizeThinkingLevel,
	type AgentConfigInternal,
} from "./agents.js";
import {
	createInternalTaskCompletionExtension,
	INTERNAL_TASK_COMPLETION_TOOL_NAME,
	normalizeInternalTaskCompletionInput,
	type InternalTaskCompletionInput,
	type InternalTaskCompletionResult,
} from "./internal-agent-tools.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

interface PromptableSession {
	prompt(prompt: string, options?: unknown): Promise<void> | void;
	messages: Array<{ role: string; content: unknown }>;
	getActiveToolNames?: () => string[];
	setActiveToolsByName?: (names: string[]) => Promise<void> | void;
	setModel?: (model: Model<Api>) => Promise<void> | void;
	setThinkingLevel?: (level: ThinkingLevel) => Promise<void> | void;
}

interface ShutdownableSessionManager {
	shutdown?: () => Promise<void> | void;
}

export interface CreateAgentSessionOptions {
	cwd: string;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	noTools?: "all" | "builtin";
	sessionManager: ShutdownableSessionManager;
	settingsManager?: SettingsManager;
	resourceLoader?: DefaultResourceLoader;
	model?: Model<Api>;
	thinkingLevel?: ThinkingLevel;
	completeInternalTask?: (input: InternalTaskCompletionInput) => Promise<InternalTaskCompletionResult>;
}

export type CreateAgentSessionFn = (
	options: CreateAgentSessionOptions,
) => Promise<{ session: PromptableSession; extensionsResult: unknown }>;

export type SummaryCompleteFn = (
	model: Model<Api>,
	context: Context,
	options?: ProviderStreamOptions,
) => Promise<AssistantMessage>;

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

export interface WorkspaceMemoryWorkersOptions {
	jobQueue: BackgroundJobQueue;
	workspaceDir: string;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	pollIntervalMs?: number;
	now?: () => number;
	createAgentSessionFn?: CreateAgentSessionFn;
	completeFn?: SummaryCompleteFn;
	sessionManagerFactory?: (workspaceDir: string) => ShutdownableSessionManager;
	resolveBackgroundModel?: () => Promise<string | undefined> | string | undefined;
	resolveBackgroundThinkingLevel?: () => Promise<ThinkingLevel | undefined> | ThinkingLevel | undefined;
}

const MEMORY_HEADER = "# MEMORY\n";
const WIKI_HEADER = "# Wiki\n";
const MAX_TRANSCRIPT_CHARS = 32_000;
const MAX_MEMORY_LINES = 40;
const MAX_SCENARIO_CONTEXT_CHARS = 16_000;
const SENSITIVE_PATTERN =
	/(token|api[_-]?key|apikey|password|passwd|secret|private key|私钥|密码|密钥|令牌|sk-[a-z0-9_-]{8,})/i;
const SCENARIO_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/i;
const MEMORY_AGENT_NAME = "memory-agent";

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

const formatMemoryEntry = (entry: { scope: string; date: string; content: string }): string =>
	normalizeMemoryLine(`[${entry.scope}][${entry.date}] ${entry.content}`);

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

const isMissingFileError = (error: unknown): boolean =>
	error instanceof Error && "code" in error && error.code === "ENOENT";

const isPathWithin = (root: string, target: string): boolean => {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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
	return `请读取下面这一段会话记录，生成可以直接追加到 daily 文档里的 Markdown 摘要。

要求：
- 只输出 Markdown 正文。
- 摘要要短，保留对后续工作有用的事实、决策、约束和产物。
- 涉及文件时使用工作空间相对路径；外部项目写项目名和项目内相对路径。
- 不输出 JSON。
- 不写 token、密码、私钥、密钥等敏感信息。

会话：
- sessionId: ${payload.sessionId}
- 标题: ${payload.title}
- cwd: ${cwdDescription}

记录：
${transcript || "无可读消息"}`;
};

const SUMMARY_SYSTEM_PROMPT = `你是 ridge 的 summary agent。你把一次会话压缩成可以直接追加到 daily 文档的 Markdown。`;

const buildMemoryPrompt = (memory: string, daily: string, scenarios: string) => `请维护长期记忆。

可编辑文件：
- 记忆/MEMORY.md
- 记忆/scenarios/*.md

工作方法：
- 读取今天 daily、当前 MEMORY 和现有 Scenario。
- 更新 记忆/scenarios/ 下的主题页。
- 更新 记忆/MEMORY.md，只保留适合启动注入的当前有效结论。
- 日期用于可信度和冲突判断。
- 完成后调用 ${INTERNAL_TASK_COMPLETION_TOOL_NAME}。

当前 MEMORY:
${memory || "# MEMORY"}

现有 Scenario:
${scenarios || "无"}

今天 daily:
${daily || "无"}`;

const resolveMaybe = async <T>(value: (() => Promise<T | undefined> | T | undefined) | undefined): Promise<T | undefined> =>
	typeof value === "function" ? await value() : undefined;

const resolveBackgroundModel = (
	modelRegistry: ModelRegistry,
	modelSpec: string | undefined,
): Model<Api> | undefined => {
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

const resolveRequiredModel = (
	modelRegistry: ModelRegistry,
	modelSpec: string | undefined,
): Model<Api> => {
	const explicit = resolveBackgroundModel(modelRegistry, modelSpec);
	if (explicit) return explicit;
	modelRegistry.refresh();
	const [first] = modelRegistry.getAvailable();
	if (!first) {
		throw new Error("No configured Pi model is available for summary agent");
	}
	return first;
};

const assistantMessageText = (message: AssistantMessage): string =>
	extractTextParts(message.content).join("\n").trim();

const runSummaryCompletion = async (
	options: {
		modelRegistry: ModelRegistry;
		completeFn: SummaryCompleteFn;
		modelSpec?: string;
		thinkingLevel?: ThinkingLevel;
	},
	prompt: string,
): Promise<string> => {
	const model = resolveRequiredModel(options.modelRegistry, options.modelSpec);
	const auth = await options.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		throw new Error(auth.error);
	}
	const completionOptions: ProviderStreamOptions = {
		apiKey: auth.apiKey,
		headers: auth.headers,
		temperature: 0.2,
		maxTokens: 1400,
	};
	if (model.reasoning && options.thinkingLevel) {
		completionOptions.reasoning = options.thinkingLevel;
	}
	const response = await options.completeFn(
		model,
		{
			systemPrompt: SUMMARY_SYSTEM_PROMPT,
			messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
			tools: [],
		},
		completionOptions,
	);
	if (response.stopReason === "error" || response.stopReason === "aborted") {
		throw new Error(response.errorMessage || "Summary model request failed");
	}
	const markdown = assistantMessageText(response);
	if (!markdown) {
		throw new Error("Empty response from summary agent");
	}
	return markdown;
};

const appendDailySummary = async (
	workspaceDir: string,
	payload: SummaryJobPayload,
	summaryMarkdown: string,
) => {
	const filePath = dailyFilePath(workspaceDir, payload);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	let current = await readTextFileIfExists(filePath);
	if (!current.trim()) {
		current = `# ${payload.dailyDate}\n`;
	}
	const entry = [
		"",
		`## ${payload.dailyTime} ${payload.sessionId} ${payload.title}`,
		"",
		summaryMarkdown.trim(),
		"",
	].join("\n");
	await fs.writeFile(filePath, `${current.replace(/\s*$/, "\n")}${entry}`, "utf8");
};

async function getMemoryAgent(workspaceDir: string): Promise<AgentConfigInternal> {
	const agents = await discoverAgents(workspaceDir);
	const agent = agents.find((item) => item.name === MEMORY_AGENT_NAME);
	if (!agent || agent.enabled === false) {
		return {
			name: MEMORY_AGENT_NAME,
			description: "维护长期记忆",
			displayName: "Memory Agent",
			mode: "all",
			visible: false,
			enabled: true,
			inheritContext: false,
			permission: {
				ask: "deny",
				subagent: "deny",
				bash: "deny",
				edit: {
					"*": "deny",
					"记忆/MEMORY.md": "allow",
					"记忆/scenarios/*": "allow",
				},
			} as AgentPermission,
			systemPrompt: "你是 ridge 的记忆维护 Agent。你维护 记忆/MEMORY.md 和 记忆/scenarios/，完成后调用 complete_internal_task。",
			source: "builtin:memory-agent",
			sourceScope: "default",
		} as AgentConfigInternal;
	}
	return {
		...agent,
		visible: false,
		permission: {
			...(agent.permission || {}),
			ask: "deny",
			subagent: "deny",
			bash: "deny",
			edit: {
				"*": "deny",
				"记忆/MEMORY.md": "allow",
				"记忆/scenarios/*": "allow",
			},
		},
	};
}

const runMemoryAgent = async (
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
): Promise<InternalTaskCompletionResult> => {
	const agent = await getMemoryAgent(options.workspaceDir);
	let completion: InternalTaskCompletionResult | null = null;
	const completeInternalTask = async (
		rawInput: InternalTaskCompletionInput,
	): Promise<InternalTaskCompletionResult> => {
		const input = normalizeInternalTaskCompletionInput(rawInput);
		completion = {
			agentName: MEMORY_AGENT_NAME,
			status: input.status,
			summary: input.summary,
			error: input.status === "failed" ? (input.error || input.summary) : undefined,
			completedAt: Date.now(),
		};
		return completion;
	};

	let permissionPolicy: ReturnType<typeof compileAgentPermission> | null = null;
	const settingsManager = createPiDefaultSettingsManager(options.workspaceDir);
	const sessionManager = options.sessionManagerFactory(options.workspaceDir);
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.workspaceDir,
		agentDir: getPiDefaultAgentDir(),
		settingsManager,
		appendSystemPromptOverride: (base: string[]) => [
			...base,
			agent.systemPrompt,
		],
		extensionFactories: [
			createPermissionGateExtension(() => permissionPolicy),
			createInternalTaskCompletionExtension({
				agentName: MEMORY_AGENT_NAME,
				onComplete: completeInternalTask,
			}),
		],
	});

	try {
		await resourceLoader.reload();
		const { session } = await options.createAgentSessionFn({
			cwd: options.workspaceDir,
			authStorage: options.authStorage,
			modelRegistry: options.modelRegistry,
			sessionManager,
			settingsManager,
			resourceLoader,
			model: options.backgroundModel,
			thinkingLevel: options.backgroundThinkingLevel,
			completeInternalTask,
		});
		if (options.backgroundModel && session.setModel) {
			await session.setModel(options.backgroundModel);
		}
		const thinking = normalizeThinkingLevel(options.backgroundThinkingLevel || agent.thinking);
		if (thinking && session.setThinkingLevel) {
			await session.setThinkingLevel(thinking);
		}
		const activeTools = session.getActiveToolNames?.() || [];
		permissionPolicy = compileAgentPermission(
			options.workspaceDir,
			agent.permission,
			activeTools,
			await loadGlobalPermissionConfig(getPiDefaultAgentDir()),
		);
		if (session.setActiveToolsByName) {
			await session.setActiveToolsByName(permissionPolicy.activeToolNames);
		}
		await session.prompt(prompt, { source: "background" });
		if (!completion) {
			throw new Error(`${MEMORY_AGENT_NAME} did not call ${INTERNAL_TASK_COMPLETION_TOOL_NAME}`);
		}
		return completion;
	} finally {
		await sessionManager.shutdown?.();
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
	const completeFn = options.completeFn ?? realComplete;
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
			let messages: AgentMessage[];
			try {
				messages = await readStoredSessionMessages(payload.sessionFile);
			} catch (error) {
				if (isMissingFileError(error)) {
					options.jobQueue.complete(job.jobId, {
						skipped: true,
						reason: "session_file_missing",
					});
					return;
				}
				throw error;
			}
			const prompt = buildSummaryPrompt(payload as SummaryJobPayload, messages);
			const backgroundModelSpec = await resolveMaybe(options.resolveBackgroundModel);
			const backgroundThinkingLevel = await resolveMaybe(options.resolveBackgroundThinkingLevel);
			const summaryMarkdown = await runSummaryCompletion(
				{
					modelRegistry,
					completeFn,
					modelSpec: backgroundModelSpec,
					thinkingLevel: backgroundThinkingLevel,
				},
				prompt,
			);
			await appendDailySummary(options.workspaceDir, payload as SummaryJobPayload, summaryMarkdown);
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
			const backgroundModel = resolveBackgroundModel(
				modelRegistry,
				await resolveMaybe(options.resolveBackgroundModel),
			);
			const backgroundThinkingLevel = await resolveMaybe(options.resolveBackgroundThinkingLevel);
			const result = await runMemoryAgent(
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
			options.jobQueue.complete(job.jobId, result);
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
