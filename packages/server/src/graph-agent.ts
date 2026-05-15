import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import {
	AuthStorage,
	createAgentSession as realCreateAgentSession,
	ModelRegistry,
	SessionManager as RealSessionManager,
} from "@mariozechner/pi-coding-agent";
import type { RidgeDatabase } from "./db/index.js";
import {
	GRAPH_ENTITY_TYPES,
	assertGraphEntityType,
	createKuzuGraphStore,
	type GraphCorrection,
	type GraphEntityInput,
	type GraphExtraction,
	type GraphRelationInput,
	type GraphStore,
} from "./graph-store.js";
import { isPathInsideRoot } from "./file-manager.js";
import { toPosixPath } from "./utils/paths.js";

export interface GraphSourceDocument {
	sourcePath: string;
	content: string;
	kind: "standard_markdown" | "daily" | "internal_project";
}

export interface GraphMaintenanceResult {
	sources: number;
	entities: number;
	relations: number;
}

export interface GraphMaintenanceRunner {
	runNightlyOnce(): Promise<GraphMaintenanceResult>;
	applyNaturalLanguageCorrection(correctionText: string): Promise<GraphMaintenanceResult>;
}

export type ExtractGraphFn = (sources: GraphSourceDocument[]) => Promise<Omit<GraphExtraction, "sourcePath">>;

export const GRAPH_EXTRACTION_PROMPT = `你是 ridge 的 graph agent。你只读取当前输入中的标准产物和 daily，不猜测未给出的原文件内容。

请从输入中抽取结构化图谱，严格返回 JSON，不要输出 Markdown。

实体类型只能是：
${GRAPH_ENTITY_TYPES.join(" | ")}

输出 schema：
{
  "entities": [
    {
      "type": "Project|File|Task|Person|Org|Concept|Tech|Source|Decision",
      "id": "稳定英文或路径派生 ID",
      "name": "可读名称",
      "summary": "一句话摘要",
      "sourcePath": "证据来源相对路径",
      "evidence": "短摘录，不超过 80 字",
      "confidence": 0.0
    }
  ],
  "relations": [
    {
      "from": { "type": "Project", "id": "..." },
      "to": { "type": "File", "id": "..." },
      "predicate": "UPPER_SNAKE_CASE",
      "sourcePath": "证据来源相对路径",
      "evidence": "短摘录，不超过 80 字",
      "confidence": 0.0
    }
  ]
}

规则：
- 外部项目不入图谱。
- 不直接读取混杂原文件，只基于当前输入。
- 关系必须带 sourcePath 和 evidence。
- 用户纠错输入优先于旧理解。`;

export interface PromptableSession {
	prompt(prompt: string, options?: unknown): Promise<void>;
	messages: Array<{ role: string; content: unknown }>;
}

export interface ShutdownableSessionManager {
	shutdown(): Promise<void>;
}

export interface InjectedCreateAgentSessionOptions {
	cwd: string;
	authStorage: unknown;
	modelRegistry: unknown;
	noTools: string;
	sessionManager: ShutdownableSessionManager;
	model?: string;
}

export type CreateAgentSessionFn = (
	options: InjectedCreateAgentSessionOptions,
) => Promise<{ session: PromptableSession; extensionsResult: unknown }>;

type SearchChunkRow = {
	target_path: string;
	source_path: string;
	chunk_text: string;
	file_type: string;
	chunk_index: number;
};

type ProjectRow = {
	path: string;
	name: string;
	project_id: string;
	project_type: string;
};

const MAX_SOURCE_CHARS = 8_000;
const MAX_PROMPT_CHARS = 80_000;

const ignoredSegments = new Set([".ridge", ".originals", ".git", "node_modules"]);

const splitPathSegments = (value: string): string[] =>
	value.split(/[\\/]+/).filter(Boolean);

const isAllowedGraphSourcePath = (relativePath: string): boolean => {
	if (!relativePath.endsWith(".md")) return false;
	return splitPathSegments(relativePath).every((segment) => !ignoredSegments.has(segment));
};

const isInsideWorkspace = (candidatePath: string, workspaceDir: string): boolean =>
	isPathInsideRoot(path.resolve(candidatePath), path.resolve(workspaceDir));

const isRealPathInsideRoot = async (candidatePath: string, rootDir: string): Promise<boolean> => {
	try {
		const [realCandidate, realRoot] = await Promise.all([
			fs.realpath(candidatePath),
			fs.realpath(rootDir),
		]);
		return isPathInsideRoot(path.resolve(realCandidate), path.resolve(realRoot));
	} catch {
		return false;
	}
};

const truncate = (value: string, limit: number): string =>
	value.length <= limit ? value : value.slice(0, limit).trimEnd();

const normalizeSourceContent = (value: string): string =>
	truncate(value.replace(/\r\n/g, "\n").trim(), MAX_SOURCE_CHARS);

const sourceKey = (sourcePath: string): string => sourcePath.replace(/\\/g, "/");

const addSource = (
	sources: Map<string, GraphSourceDocument>,
	source: GraphSourceDocument,
) => {
	const key = sourceKey(source.sourcePath);
	const existing = sources.get(key);
	if (!existing) {
		sources.set(key, { ...source, sourcePath: key });
		return;
	}
	if (existing.kind === "daily") return;
	sources.set(key, {
		...source,
		sourcePath: key,
		content: truncate(`${existing.content}\n\n${source.content}`, MAX_SOURCE_CHARS),
	});
};

async function collectDailySources(
	workspaceDir: string,
	sources: Map<string, GraphSourceDocument>,
) {
	const dailyRoot = path.join(workspaceDir, "记忆", "daily");
	const walk = async (dir: string) => {
		if (!(await isRealPathInsideRoot(dir, workspaceDir))) return;
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
			}
			for (const entry of entries) {
				const entryPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					await walk(entryPath);
					continue;
				}
				if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
				if (!(await isRealPathInsideRoot(entryPath, workspaceDir))) continue;
				const relativePath = toPosixPath(path.relative(workspaceDir, entryPath));
				addSource(sources, {
					sourcePath: relativePath,
				content: normalizeSourceContent(await fs.readFile(entryPath, "utf-8")),
				kind: "daily",
			});
		}
	};
	await walk(dailyRoot);
}

async function collectInternalProjectMarkdownSources(
	db: RidgeDatabase,
	workspaceDir: string,
	sources: Map<string, GraphSourceDocument>,
) {
	const projects = db
		.prepare(
			`SELECT project_id, name, path, project_type
			 FROM projects
			 WHERE project_type = 'internal'
			   AND archived_at IS NULL
			   AND (workspace_path = ? OR workspace_path = '')`,
		)
		.all(workspaceDir) as ProjectRow[];

	const walk = async (projectPath: string) => {
		if (!isInsideWorkspace(projectPath, workspaceDir)) return;
		if (!(await isRealPathInsideRoot(projectPath, workspaceDir))) return;
		let entries: Dirent[];
		try {
			entries = await fs.readdir(projectPath, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const entryPath = path.join(projectPath, entry.name);
			const relativePath = toPosixPath(path.relative(workspaceDir, entryPath));
			if (splitPathSegments(relativePath).some((segment) => ignoredSegments.has(segment))) {
				continue;
			}
				if (entry.isDirectory()) {
					await walk(entryPath);
					continue;
				}
				if (!entry.isFile() || !isAllowedGraphSourcePath(relativePath)) continue;
				if (!(await isRealPathInsideRoot(entryPath, workspaceDir))) continue;
				addSource(sources, {
					sourcePath: relativePath,
					content: normalizeSourceContent(await fs.readFile(entryPath, "utf-8")),
				kind: "internal_project",
			});
		}
	};

	for (const project of projects) {
		await walk(project.path);
	}
}

export async function collectGraphExtractionSources(options: {
	db: RidgeDatabase;
	workspaceDir: string;
}): Promise<GraphSourceDocument[]> {
	const workspaceDir = path.resolve(options.workspaceDir);
	const sources = new Map<string, GraphSourceDocument>();
	const chunkRows = options.db
		.prepare(
			`SELECT sc.target_path, sc.source_path, sc.chunk_text, sc.file_type, sc.chunk_index
			 FROM search_chunks sc
			 INNER JOIN search_index_status sis ON sis.target_path = sc.target_path
			 WHERE sis.status = 'indexed'
			   AND sis.workspace_path = ?
			   AND sc.file_type = 'markdown'
			 ORDER BY sc.source_path ASC, sc.chunk_index ASC`,
		)
		.all(workspaceDir) as SearchChunkRow[];

	for (const row of chunkRows) {
		if (!isInsideWorkspace(row.target_path, workspaceDir)) continue;
		if (!(await isRealPathInsideRoot(row.target_path, workspaceDir))) continue;
		const relativePath = sourceKey(row.source_path || toPosixPath(path.relative(workspaceDir, row.target_path)));
		if (!isAllowedGraphSourcePath(relativePath)) continue;
		addSource(sources, {
			sourcePath: relativePath,
			content: normalizeSourceContent(row.chunk_text),
			kind: "standard_markdown",
		});
	}

	await collectInternalProjectMarkdownSources(options.db, workspaceDir, sources);
	await collectDailySources(workspaceDir, sources);

	return [...sources.values()].sort((left, right) =>
		left.sourcePath.localeCompare(right.sourcePath),
	);
}

function extractJsonFromText(text: string): unknown {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) throw new Error("Graph agent response does not contain JSON");
	return JSON.parse(match[0]) as unknown;
}

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid graph ${label}`);
	}
	return value as Record<string, unknown>;
};

const stringField = (record: Record<string, unknown>, key: string): string => {
	const value = record[key];
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Invalid graph field: ${key}`);
	}
	return value.trim();
};

const optionalStringField = (record: Record<string, unknown>, key: string): string | undefined => {
	const value = record[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const optionalConfidence = (record: Record<string, unknown>): number | undefined => {
	const value = record.confidence;
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const parseEntityRef = (value: unknown): { type: GraphEntityInput["type"]; id: string } => {
	const record = asRecord(value, "entity ref");
	return {
		type: assertGraphEntityType(stringField(record, "type")),
		id: stringField(record, "id"),
	};
};

function parseEntity(value: unknown): GraphEntityInput {
	const record = asRecord(value, "entity");
	return {
		type: assertGraphEntityType(stringField(record, "type")),
		id: stringField(record, "id"),
		name: stringField(record, "name"),
		summary: optionalStringField(record, "summary"),
		sourcePath: optionalStringField(record, "sourcePath") ?? "",
		evidence: optionalStringField(record, "evidence"),
		confidence: optionalConfidence(record),
	};
}

function parseRelation(value: unknown): GraphRelationInput {
	const record = asRecord(value, "relation");
	return {
		from: parseEntityRef(record.from),
		to: parseEntityRef(record.to),
		predicate: stringField(record, "predicate"),
		sourcePath: stringField(record, "sourcePath"),
		evidence: stringField(record, "evidence"),
		confidence: optionalConfidence(record),
	};
}

export function parseGraphAgentResponse(text: string): Omit<GraphExtraction, "sourcePath"> {
	const raw = extractJsonFromText(text);
	const record = asRecord(raw, "response");
	if (!Array.isArray(record.entities) || !Array.isArray(record.relations)) {
		throw new Error("Graph agent response must include entities and relations arrays");
	}
	return {
		entities: record.entities.map(parseEntity),
		relations: record.relations.map(parseRelation),
	};
}

function toMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object") return "";
			const typed = item as Record<string, unknown>;
			if (typed.type === "text") return typeof typed.text === "string" ? typed.text : "";
			if (typed.type === "thinking") return typeof typed.thinking === "string" ? typed.thinking : "";
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function getLastAssistantText(session: PromptableSession): string {
	for (let i = session.messages.length - 1; i >= 0; i--) {
		const message = session.messages[i];
		if (message.role !== "assistant") continue;
		const text = toMessageText(message.content).trim();
		if (text) return text;
	}
	return "";
}

function buildExtractionPrompt(sources: GraphSourceDocument[]): string {
	let body = "";
	for (const source of sources) {
		const next = `\n\n<source path="${source.sourcePath}" kind="${source.kind}">\n${source.content}\n</source>`;
		if ((GRAPH_EXTRACTION_PROMPT.length + body.length + next.length) > MAX_PROMPT_CHARS) break;
		body += next;
	}
	return `${GRAPH_EXTRACTION_PROMPT}\n\n输入：${body}`;
}

export function createPiGraphExtractor(options: {
	workspaceDir: string;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	modelSpec?: string;
	createAgentSessionFn?: CreateAgentSessionFn;
	sessionManagerFactory?: (workspaceDir: string) => ShutdownableSessionManager;
}): ExtractGraphFn {
	return async (sources) => {
		const createAgentSessionFn = options.createAgentSessionFn ?? realCreateAgentSession as unknown as CreateAgentSessionFn;
		const sessionManager = options.sessionManagerFactory
			? options.sessionManagerFactory(options.workspaceDir)
			: RealSessionManager.inMemory(options.workspaceDir) as unknown as ShutdownableSessionManager;
		const { session } = await createAgentSessionFn({
			cwd: options.workspaceDir,
			authStorage: options.authStorage,
			modelRegistry: options.modelRegistry,
			noTools: "all",
			sessionManager,
			model: options.modelSpec,
		});
		try {
			await session.prompt(buildExtractionPrompt(sources), { source: "background" });
			return parseGraphAgentResponse(getLastAssistantText(session));
		} finally {
			await sessionManager.shutdown().catch(() => undefined);
		}
	};
}

const defaultEmptyExtraction = (): Omit<GraphExtraction, "sourcePath"> => ({
	entities: [],
	relations: [],
});

export function createGraphMaintenanceRunner(options: {
	db: RidgeDatabase;
	workspaceDir: string;
	extract?: ExtractGraphFn;
	graphStore?: GraphStore;
}): GraphMaintenanceRunner {
	const extract = options.extract ?? (async () => defaultEmptyExtraction());
	const graphStore = options.graphStore ?? createKuzuGraphStore({ workspaceDir: options.workspaceDir });

	return {
		runNightlyOnce: async () => {
			const sources = await collectGraphExtractionSources({
				db: options.db,
				workspaceDir: options.workspaceDir,
			});
			const extracted = sources.length > 0 ? await extract(sources) : defaultEmptyExtraction();
			await graphStore.upsertExtraction({
				sourcePath: "nightly",
				...extracted,
			});
			return {
				sources: sources.length,
				entities: extracted.entities.length,
				relations: extracted.relations.length,
			};
		},
		applyNaturalLanguageCorrection: async (correctionText) => {
			const source: GraphSourceDocument = {
				sourcePath: "用户纠错",
				content: correctionText,
				kind: "daily",
			};
			const extracted = await extract([source]);
			const correction: GraphCorrection = {
				correctionText,
				...extracted,
			};
			await graphStore.applyCorrection(correction);
			return {
				sources: 1,
				entities: extracted.entities.length,
				relations: extracted.relations.length,
			};
		},
	};
}

export const graphEntityId = (type: string, sourcePath: string, name: string): string =>
	`${type.toLowerCase()}-${crypto
		.createHash("sha256")
		.update(`${sourcePath}\0${name}`)
		.digest("hex")
		.slice(0, 16)}`;
