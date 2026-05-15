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
import { isPathInsideRoot } from "./file-manager.js";
import {
	GRAPH_ENTITY_TYPES,
	buildGraphSchemaStatements,
	createDefaultKuzuClient,
	resolveGraphDbPath,
	type GraphDbClientFactory,
} from "./graph-store.js";
import {
	markRagTargetPending,
	removeRagTarget,
	type RagIndexOptions,
} from "./rag-indexer.js";
import { toPosixPath } from "./utils/paths.js";

export interface WikiSourceDocument {
	sourcePath: string;
	content: string;
	kind: "current_wiki" | "memory" | "daily" | "rag" | "graph";
}

export interface WikiPageDraft {
	path: string;
	content: string;
}

export interface WikiMaintenanceDraft {
	pages: WikiPageDraft[];
	deletePaths: string[];
}

export interface WikiMaintenanceResult {
	sources: number;
	pagesWritten: number;
	pagesDeleted: number;
}

export interface WikiMaintenanceRunner {
	runNightlyOnce(): Promise<WikiMaintenanceResult>;
}

export interface PromptableWikiSession {
	prompt(prompt: string, options?: unknown): Promise<void>;
	messages: Array<{ role: string; content: unknown }>;
}

export interface ShutdownableWikiSessionManager {
	shutdown(): Promise<void>;
}

export interface CreateWikiAgentSessionOptions {
	cwd: string;
	authStorage: unknown;
	modelRegistry: unknown;
	noTools: string;
	sessionManager: ShutdownableWikiSessionManager;
	model?: string;
}

export type CreateWikiAgentSessionFn = (
	options: CreateWikiAgentSessionOptions,
) => Promise<{ session: PromptableWikiSession; extensionsResult: unknown }>;

export type MaintainWikiFn = (sources: WikiSourceDocument[]) => Promise<WikiMaintenanceDraft>;
export type GraphSnapshotReader = () => Promise<WikiSourceDocument[]>;

type SearchChunkRow = {
	target_path: string;
	source_path: string;
	chunk_text: string;
	file_type: string;
	chunk_index: number;
};

const MAX_SOURCE_CHARS = 6_000;
const MAX_PROMPT_CHARS = 90_000;
const WIKI_HEADER = "# Wiki\n";
const ignoredSegments = new Set([".ridge", ".originals", ".git", "node_modules"]);

export const WIKI_MAINTENANCE_PROMPT = `你是 ridge 的 wiki agent。你维护 Wiki/ 下少量 canonical Markdown 页面，不创建百科式大文件库，也不替代 RAG。

严格返回 JSON，不要输出 Markdown 代码块。

输出 schema：
{
  "pages": [
    {
      "path": "index.md 或 页面名.md",
      "content": "# Markdown 标题\\n\\n正文"
    }
  ],
  "deletePaths": ["低价值或过时页面.md"]
}

规则：
- 只能写入 Wiki/ 内的 .md 页面；path 必须是相对 Wiki/ 的路径。
- index.md 是固定入口；如果维护 Wiki，index.md 必须保留为少量核心入口链接。
- 当前输入里的 current_wiki 是用户可编辑真源；后续维护必须以当前文件内容为准。
- 只保留少量 canonical Markdown 页面，合并重复主题，删除低价值或过时页面。
- 可以参考 memory、daily、rag、graph 来源，但不要把 Wiki 做成第二个文件库。
- 不要写入 token、密码、私钥或其他敏感信息。
- 如果没有可维护内容，可以返回空 pages 和空 deletePaths。`;

const splitPathSegments = (value: string): string[] =>
	value.split(/[\\/]+/).filter(Boolean);

const normalizeSourceContent = (value: string): string => {
	const text = value.replace(/\r\n/g, "\n").trim();
	return text.length <= MAX_SOURCE_CHARS ? text : text.slice(0, MAX_SOURCE_CHARS).trimEnd();
};

const sourceKey = (sourcePath: string): string => sourcePath.replace(/\\/g, "/");

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

const isAllowedMarkdownRelativePath = (relativePath: string): boolean => {
	if (!relativePath.endsWith(".md")) return false;
	return splitPathSegments(relativePath).every(
		(segment) => !ignoredSegments.has(segment) && !segment.startsWith("."),
	);
};

const addSource = (
	sources: Map<string, WikiSourceDocument>,
	source: WikiSourceDocument,
) => {
	const key = `${source.kind}:${sourceKey(source.sourcePath)}`;
	const existing = sources.get(key);
	if (!existing) {
		sources.set(key, { ...source, sourcePath: sourceKey(source.sourcePath) });
		return;
	}
	sources.set(key, {
		...source,
		sourcePath: sourceKey(source.sourcePath),
		content: normalizeSourceContent(`${existing.content}\n\n${source.content}`),
	});
};

async function collectMarkdownTreeSources(options: {
	workspaceDir: string;
	rootDir: string;
	kind: WikiSourceDocument["kind"];
	sources: Map<string, WikiSourceDocument>;
}) {
	const walk = async (dir: string) => {
		if (!(await isRealPathInsideRoot(dir, options.workspaceDir))) return;
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		for (const entry of entries) {
			const entryPath = path.join(dir, entry.name);
			const relativePath = toPosixPath(path.relative(options.workspaceDir, entryPath));
			if (splitPathSegments(relativePath).some((segment) => ignoredSegments.has(segment))) {
				continue;
			}
			if (entry.isDirectory()) {
				await walk(entryPath);
				continue;
			}
			if (!entry.isFile() || !isAllowedMarkdownRelativePath(relativePath)) continue;
			if (!(await isRealPathInsideRoot(entryPath, options.workspaceDir))) continue;
			addSource(options.sources, {
				sourcePath: relativePath,
				content: normalizeSourceContent(await fs.readFile(entryPath, "utf-8")),
				kind: options.kind,
			});
		}
	};
	await walk(options.rootDir);
}

async function collectMemorySource(
	workspaceDir: string,
	sources: Map<string, WikiSourceDocument>,
) {
	const memoryPath = path.join(workspaceDir, "记忆", "MEMORY.md");
	try {
		if (!(await isRealPathInsideRoot(memoryPath, workspaceDir))) return;
		addSource(sources, {
			sourcePath: "记忆/MEMORY.md",
			content: normalizeSourceContent(await fs.readFile(memoryPath, "utf-8")),
			kind: "memory",
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

async function collectRagSources(
	db: RidgeDatabase,
	workspaceDir: string,
	sources: Map<string, WikiSourceDocument>,
) {
	const rows = db
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

	for (const row of rows) {
		if (!isInsideWorkspace(row.target_path, workspaceDir)) continue;
		if (!(await isRealPathInsideRoot(row.target_path, workspaceDir))) continue;
		const relativePath = sourceKey(row.source_path || toPosixPath(path.relative(workspaceDir, row.target_path)));
		if (!isAllowedMarkdownRelativePath(relativePath)) continue;
		addSource(sources, {
			sourcePath: relativePath,
			content: normalizeSourceContent(row.chunk_text),
			kind: "rag",
		});
	}
}

const rowValue = (row: unknown, keys: string[]): string => {
	if (!row || typeof row !== "object") return "";
	const record = row as Record<string, unknown>;
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number" && Number.isFinite(value)) return String(value);
	}
	return "";
};

export function createKuzuGraphSnapshotReader(options: {
	workspaceDir: string;
	clientFactory?: GraphDbClientFactory;
	limit?: number;
}): GraphSnapshotReader {
	const clientFactory = options.clientFactory ?? createDefaultKuzuClient;
	const limit = options.limit ?? 80;
	return async () => {
		const dbPath = resolveGraphDbPath(options.workspaceDir);
		const client = await clientFactory(dbPath);
		try {
			for (const statement of buildGraphSchemaStatements()) {
				await client.query(statement);
			}
			const lines: string[] = [];
			for (const type of GRAPH_ENTITY_TYPES) {
				const rows = await client.query(
					`MATCH (n:${type}) RETURN n.id AS id, n.name AS name, n.summary AS summary, n.source_path AS source_path, n.evidence AS evidence LIMIT ${limit}`,
				);
				for (const row of rows) {
					const name = rowValue(row, ["name", "n.name"]);
					if (!name) continue;
					const summary = rowValue(row, ["summary", "n.summary"]);
					const sourcePath = rowValue(row, ["source_path", "n.source_path"]);
					const evidence = rowValue(row, ["evidence", "n.evidence"]);
					lines.push(`- ${type}: ${name}${summary ? ` - ${summary}` : ""}${sourcePath ? ` (${sourcePath})` : ""}${evidence ? ` evidence: ${evidence}` : ""}`);
				}
			}
			const relationRows = await client.query(
				`MATCH (a)-[r:EvidenceRelation]->(b) RETURN r.predicate AS predicate, r.source_path AS source_path, r.evidence AS evidence LIMIT ${limit}`,
			);
			for (const row of relationRows) {
				const predicate = rowValue(row, ["predicate", "r.predicate"]);
				const evidence = rowValue(row, ["evidence", "r.evidence"]);
				if (!predicate && !evidence) continue;
				lines.push(`- Relation: ${predicate}${evidence ? ` evidence: ${evidence}` : ""}`);
			}
			if (lines.length === 0) return [];
			return [{
				sourcePath: ".ridge/graph.kuzu",
				kind: "graph" as const,
				content: normalizeSourceContent(lines.join("\n")),
			}];
		} finally {
			await client.close?.();
		}
	};
}

export async function collectWikiMaintenanceSources(options: {
	db: RidgeDatabase;
	workspaceDir: string;
	graphSnapshotReader?: GraphSnapshotReader;
}): Promise<WikiSourceDocument[]> {
	const workspaceDir = path.resolve(options.workspaceDir);
	const sources = new Map<string, WikiSourceDocument>();
	await collectMarkdownTreeSources({
		workspaceDir,
		rootDir: path.join(workspaceDir, "Wiki"),
		kind: "current_wiki",
		sources,
	});
	await collectMemorySource(workspaceDir, sources);
	await collectMarkdownTreeSources({
		workspaceDir,
		rootDir: path.join(workspaceDir, "记忆", "daily"),
		kind: "daily",
		sources,
	});
	await collectRagSources(options.db, workspaceDir, sources);
	const graphSources = await (options.graphSnapshotReader ?? createKuzuGraphSnapshotReader({ workspaceDir }))();
	for (const source of graphSources) {
		addSource(sources, source);
	}
	return [...sources.values()].sort((left, right) =>
		`${left.kind}:${left.sourcePath}`.localeCompare(`${right.kind}:${right.sourcePath}`),
	);
}

function extractJsonFromText(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
		throw new Error("Wiki agent response must be strict JSON");
	}
	return JSON.parse(trimmed) as unknown;
}

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid Wiki ${label}`);
	}
	return value as Record<string, unknown>;
};

const validateWikiRelativePath = (value: unknown): string => {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error("Invalid Wiki path");
	}
	const normalized = value.replace(/\\/g, "/").trim();
	if (
		path.posix.isAbsolute(normalized) ||
		/^[A-Za-z]:\//.test(normalized) ||
		normalized.startsWith("../") ||
		normalized.includes("/../") ||
		normalized === ".." ||
		normalized.startsWith("Wiki/") ||
		!normalized.endsWith(".md")
	) {
		throw new Error(`Invalid Wiki path: ${value}`);
	}
	if (splitPathSegments(normalized).some((segment) => ignoredSegments.has(segment))) {
		throw new Error(`Invalid Wiki path: ${value}`);
	}
	if (splitPathSegments(normalized).some((segment) => segment.startsWith("."))) {
		throw new Error(`Invalid Wiki path: ${value}`);
	}
	return normalized;
};

const parsePageDraft = (value: unknown): WikiPageDraft => {
	const record = asRecord(value, "page");
	const content = record.content;
	if (typeof content !== "string" || !content.trim()) {
		throw new Error("Invalid Wiki page content");
	}
	return {
		path: validateWikiRelativePath(record.path),
		content: content.replace(/\r\n/g, "\n").trim(),
	};
};

export function parseWikiAgentResponse(text: string): WikiMaintenanceDraft {
	const raw = extractJsonFromText(text);
	const record = asRecord(raw, "response");
	if (!Array.isArray(record.pages) || !Array.isArray(record.deletePaths)) {
		throw new Error("Wiki agent response must include pages and deletePaths arrays");
	}
	return {
		pages: record.pages.map(parsePageDraft),
		deletePaths: record.deletePaths.map(validateWikiRelativePath),
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
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function getLastAssistantText(session: PromptableWikiSession): string {
	for (let i = session.messages.length - 1; i >= 0; i--) {
		const message = session.messages[i];
		if (message.role !== "assistant") continue;
		const text = toMessageText(message.content).trim();
		if (text) return text;
	}
	return "";
}

function buildWikiPrompt(sources: WikiSourceDocument[]): string {
	let body = "";
	for (const source of sources) {
		const next = `\n\n<source path="${source.sourcePath}" kind="${source.kind}">\n${source.content}\n</source>`;
		if ((WIKI_MAINTENANCE_PROMPT.length + body.length + next.length) > MAX_PROMPT_CHARS) break;
		body += next;
	}
	return `${WIKI_MAINTENANCE_PROMPT}\n\n输入：${body}`;
}

export function createPiWikiMaintainer(options: {
	workspaceDir: string;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	modelSpec?: string;
	createAgentSessionFn?: CreateWikiAgentSessionFn;
	sessionManagerFactory?: (workspaceDir: string) => ShutdownableWikiSessionManager;
}): MaintainWikiFn {
	return async (sources) => {
		const createAgentSessionFn = options.createAgentSessionFn ?? realCreateAgentSession as unknown as CreateWikiAgentSessionFn;
		const sessionManager = options.sessionManagerFactory
			? options.sessionManagerFactory(options.workspaceDir)
			: RealSessionManager.inMemory(options.workspaceDir) as unknown as ShutdownableWikiSessionManager;
		const { session } = await createAgentSessionFn({
			cwd: options.workspaceDir,
			authStorage: options.authStorage,
			modelRegistry: options.modelRegistry,
			noTools: "all",
			sessionManager,
			model: options.modelSpec,
		});
		try {
			await session.prompt(buildWikiPrompt(sources), { source: "background" });
			return parseWikiAgentResponse(getLastAssistantText(session));
		} finally {
			await sessionManager.shutdown().catch(() => undefined);
		}
	};
}

const normalizeWikiPageContent = (relativePath: string, content: string): string => {
	const trimmed = content.replace(/\r\n/g, "\n").trim();
	if (relativePath === "index.md" && !trimmed.startsWith("# Wiki")) {
		return `${WIKI_HEADER}\n${trimmed}\n`;
	}
	return `${trimmed}\n`;
};

const resolveWikiPath = (workspaceDir: string, relativePath: string): string => {
	const wikiRoot = path.join(workspaceDir, "Wiki");
	const absolutePath = path.resolve(wikiRoot, relativePath);
	if (!isPathInsideRoot(absolutePath, wikiRoot)) {
		throw new Error(`Invalid Wiki path: ${relativePath}`);
	}
	return absolutePath;
};

const ensureWikiRootDirectory = async (workspaceDir: string): Promise<string> => {
	const wikiRoot = path.join(workspaceDir, "Wiki");
	try {
		const stats = await fs.lstat(wikiRoot);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error("Wiki root must be a real directory");
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		await fs.mkdir(wikiRoot, { recursive: true });
	}
	return wikiRoot;
};

const assertNoSymlinkPathSegments = async (
	wikiRoot: string,
	absolutePath: string,
	options: { includeLeaf: boolean },
) => {
	const relativePath = path.relative(wikiRoot, absolutePath);
	const segments = splitPathSegments(relativePath);
	const limit = options.includeLeaf ? segments.length : Math.max(0, segments.length - 1);
	let cursor = wikiRoot;
	for (let index = 0; index < limit; index++) {
		cursor = path.join(cursor, segments[index]!);
		try {
			const stats = await fs.lstat(cursor);
			if (stats.isSymbolicLink()) {
				throw new Error(`Refusing to write Wiki path through symlink: ${toPosixPath(path.relative(wikiRoot, cursor))}`);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
	}
};

const getRagTargetStatus = (db: RidgeDatabase, targetPath: string): string | null => {
	const row = db
		.prepare("SELECT status FROM search_index_status WHERE target_path = ?")
		.get(toPosixPath(targetPath)) as { status: string } | undefined;
	return row?.status ?? null;
};

const defaultEmptyDraft = (): WikiMaintenanceDraft => ({ pages: [], deletePaths: [] });

export function createWikiMaintenanceRunner(options: {
	db: RidgeDatabase;
	workspaceDir: string;
	maintain?: MaintainWikiFn;
	graphSnapshotReader?: GraphSnapshotReader;
	markRagTargetPendingFn?: typeof markRagTargetPending;
	removeRagTargetFn?: typeof removeRagTarget;
}): WikiMaintenanceRunner {
	const maintain = options.maintain ?? (async () => defaultEmptyDraft());
	const markPending = options.markRagTargetPendingFn ?? markRagTargetPending;
	const removePending = options.removeRagTargetFn ?? removeRagTarget;

	return {
		runNightlyOnce: async () => {
			const workspaceDir = path.resolve(options.workspaceDir);
			const wikiRoot = await ensureWikiRootDirectory(workspaceDir);
			const sources = await collectWikiMaintenanceSources({
				db: options.db,
				workspaceDir,
				graphSnapshotReader: options.graphSnapshotReader,
			});
			const draft = await maintain(sources);
			const written = new Set<string>();
			let pagesWritten = 0;
			for (const page of draft.pages) {
				const relativePath = validateWikiRelativePath(page.path);
				const absolutePath = resolveWikiPath(workspaceDir, relativePath);
				await assertNoSymlinkPathSegments(wikiRoot, absolutePath, { includeLeaf: true });
				const content = normalizeWikiPageContent(relativePath, page.content);
				const previous = await fs.readFile(absolutePath, "utf-8").catch(() => "");
				const ragStatus = getRagTargetStatus(options.db, absolutePath);
				if (previous !== content) {
					await fs.mkdir(path.dirname(absolutePath), { recursive: true });
					await fs.writeFile(absolutePath, content, "utf-8");
					pagesWritten++;
				}
				if (previous !== content || ragStatus !== "indexed") {
					await markPending(toPosixPath(absolutePath), {
						workspaceDir,
						refreshPolicy: "immediate",
						event: "nightly",
					} satisfies RagIndexOptions);
				}
				written.add(relativePath);
			}

			let pagesDeleted = 0;
			for (const deletePath of draft.deletePaths) {
				const relativePath = validateWikiRelativePath(deletePath);
				if (relativePath === "index.md" || written.has(relativePath)) continue;
				const absolutePath = resolveWikiPath(workspaceDir, relativePath);
				await assertNoSymlinkPathSegments(wikiRoot, absolutePath, { includeLeaf: false });
				try {
					await fs.rm(absolutePath);
					pagesDeleted++;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
				await removePending(toPosixPath(absolutePath));
			}

			const indexPath = path.join(workspaceDir, "Wiki", "index.md");
			try {
				await fs.access(indexPath);
			} catch {
				await fs.writeFile(indexPath, WIKI_HEADER, "utf-8");
			}

			return {
				sources: sources.length,
				pagesWritten,
				pagesDeleted,
			};
		},
	};
}
