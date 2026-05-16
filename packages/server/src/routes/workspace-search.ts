import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import type { RidgeDatabase } from "../db/index.js";
import { refreshRagTarget, searchContent, type RagSearchResult } from "../rag-indexer.js";
import { toPosixPath } from "../utils/paths.js";

export const WORKSPACE_SEARCH_TYPES = [
	"file",
	"task",
	"milestone",
	"project",
	"session",
	"memory",
	"wiki",
	"space",
	"rag",
] as const;

export type WorkspaceSearchType = (typeof WORKSPACE_SEARCH_TYPES)[number];

export interface WorkspaceSearchResult {
	id: string;
	type: WorkspaceSearchType;
	title: string;
	path?: string;
	sourcePath?: string;
	projectId?: string | null;
	targetId?: string;
	updatedAt: number;
	snippet: string;
	headingPath?: string[];
	startLine?: number;
	endLine?: number;
	score: number;
}

export interface WorkspaceSearchResponse {
	query: string;
	results: WorkspaceSearchResult[];
	groups: Array<{ type: WorkspaceSearchType; count: number }>;
	indexStatus: {
		pending: number;
		indexed: number;
		indexFailed: number;
	};
}

type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface WorkspaceKnowledgeDiagnosticsResponse {
	rag: WorkspaceSearchResponse["indexStatus"] & {
		latestIndexedAt: number | null;
		failedTargets: Array<{
			path: string;
			error: string;
			updatedAt: number;
			notificationId: string | null;
		}>;
	};
	memory: {
		memoryPath: string;
		exists: boolean;
		size: number;
		updatedAt: number | null;
		injected: boolean;
		dailyCount: number;
		latestDailyAt: number | null;
	};
	wiki: {
		indexPath: string;
		exists: boolean;
		size: number;
		updatedAt: number | null;
		injected: boolean;
		indexStatus: "pending" | "indexed" | "index_failed" | "missing";
	};
	graph: {
		graphPath: string;
		schemaExists: boolean;
		databaseExists: boolean;
		updatedAt: number | null;
		correctionsEndpoint: string;
	};
	mcp: {
		endpoint: string;
		boundary: "read_only_workspace_visible_assets";
		tools: Array<{ name: string; title: string }>;
	};
	backgroundJobs: {
		byStatus: Record<JobStatus, number>;
		byType: Array<Record<JobStatus, number> & { type: string }>;
		recentFailures: Array<{
			jobId: string;
			type: string;
			relatedType: string;
			relatedId: string;
			lastError: string;
			updatedAt: number;
			notificationId: string | null;
		}>;
	};
	notifications: {
		unhandled: number;
		ragFailures: number;
		backgroundFailures: number;
	};
}

export interface WorkspaceSearchDeps {
	defaultWorkspaceDir: string;
	getRidgeDb: () => Promise<RidgeDatabase>;
}

export interface WorkspaceSearchQuery {
	q: string;
	type?: string;
	project?: string;
	time?: "all" | "today" | "week" | "month";
	dir?: string;
	limit?: number;
	sort?: "relevance" | "updated";
}

type ProjectScope = {
	projectId: string;
	rootPath: string;
	sourcePath: string;
};

const querySchema = z.object({
	q: z.string().trim().min(1).max(200),
	type: z.string().optional(),
	project: z.string().optional(),
	time: z.enum(["all", "today", "week", "month"]).optional(),
	dir: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
	sort: z.enum(["relevance", "updated"]).optional(),
});

const refreshSchema = z.object({
	path: z.string().min(1),
});

const TYPE_PRIORITY: Record<WorkspaceSearchType, number> = {
	task: 100,
	milestone: 95,
	project: 90,
	session: 80,
	file: 70,
	memory: 68,
	wiki: 66,
	space: 64,
	rag: 60,
};

const SKIP_DIRS = new Set([".ridge", ".git", "node_modules", ".originals"]);
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".json"]);
const JOB_STATUSES: JobStatus[] = ["pending", "running", "completed", "failed", "cancelled"];
const MCP_TOOLS = [
	{ name: "rag_search", title: "Search workspace RAG chunks" },
	{ name: "graph_search", title: "Search workspace graph" },
	{ name: "file_search", title: "Search visible workspace files" },
	{ name: "read_workspace_file", title: "Read a visible workspace file" },
];

function normalize(value: string): string {
	return toPosixPath(path.resolve(value));
}

function escapeLike(value: string): string {
	return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function workspaceTargetLike(workspaceDir: string): string {
	return `${escapeLike(workspaceDir.replace(/\/+$/, ""))}/%`;
}

function relativePath(targetPath: string, workspaceDir: string): string {
	return toPosixPath(path.relative(workspaceDir, targetPath));
}

function diagnosticsPath(targetPath: string, workspaceDir: string): string {
	const normalized = normalize(targetPath);
	return isInsideWorkspace(normalized, workspaceDir)
		? relativePath(normalized, workspaceDir)
		: normalized;
}

function isInsideWorkspace(targetPath: string, workspaceDir: string): boolean {
	const rel = path.relative(workspaceDir, targetPath);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isAllowedPath(targetPath: string, workspaceDir: string): boolean {
	if (!isInsideWorkspace(targetPath, workspaceDir)) return false;
	const segments = relativePath(targetPath, workspaceDir).split("/").filter(Boolean);
	return !segments.some((segment) => SKIP_DIRS.has(segment));
}

async function isAllowedResolvedPath(targetPath: string, workspaceDir: string): Promise<boolean> {
	if (!isAllowedPath(targetPath, workspaceDir)) return false;
	const realWorkspaceDir = await fs.realpath(workspaceDir).then(normalize).catch(() => workspaceDir);
	const realTargetPath = await fs.realpath(targetPath).then(normalize).catch(() => null);
	if (!realTargetPath) return true;
	return isAllowedPath(realTargetPath, realWorkspaceDir);
}

function normalizeDirFilter(value: string): string {
	return toPosixPath(value).trim().replace(/^\/+|\/+$/g, "");
}

function isSameOrChildPath(candidate: string, parent: string): boolean {
	const normalizedCandidate = normalizeDirFilter(candidate);
	const normalizedParent = normalizeDirFilter(parent);
	return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function parseTypes(raw: string | undefined): Set<WorkspaceSearchType> {
	if (!raw) return new Set(WORKSPACE_SEARCH_TYPES);
	const valid = new Set<WorkspaceSearchType>();
	for (const item of raw.split(",").map((part) => part.trim())) {
		if ((WORKSPACE_SEARCH_TYPES as readonly string[]).includes(item)) {
			valid.add(item as WorkspaceSearchType);
		}
	}
	return valid.size > 0 ? valid : new Set(WORKSPACE_SEARCH_TYPES);
}

function matchesTime(updatedAt: number, time: "all" | "today" | "week" | "month" | undefined): boolean {
	if (!time || time === "all") return true;
	const now = Date.now();
	const age = now - updatedAt;
	if (time === "today") return age <= 24 * 60 * 60 * 1000;
	if (time === "week") return age <= 7 * 24 * 60 * 60 * 1000;
	return age <= 31 * 24 * 60 * 60 * 1000;
}

function matchesDir(result: WorkspaceSearchResult, dir: string | undefined): boolean {
	if (!dir?.trim()) return true;
	const normalizedDir = normalizeDirFilter(dir);
	if (!normalizedDir) return true;
	const candidate = result.sourcePath ?? result.path ?? "";
	if (!candidate || path.isAbsolute(candidate)) return false;
	return isSameOrChildPath(candidate, normalizedDir);
}

function scoreText(query: string, title: string, snippet: string, type: WorkspaceSearchType, updatedAt: number): number {
	const q = query.toLowerCase();
	const titleLower = title.toLowerCase();
	const snippetLower = snippet.toLowerCase();
	let score = TYPE_PRIORITY[type];
	if (titleLower === q) score += 100;
	if (titleLower.includes(q)) score += 50;
	if (snippetLower.includes(q)) score += 25;
	score += Math.max(0, 20 - Math.floor((Date.now() - updatedAt) / (7 * 24 * 60 * 60 * 1000)));
	return score;
}

function snippet(text: string, query: string): string {
	const compact = text.replace(/\s+/g, " ").trim();
	const lower = compact.toLowerCase();
	const index = lower.indexOf(query.toLowerCase());
	if (index < 0) return compact.slice(0, 220);
	return compact.slice(Math.max(0, index - 80), Math.min(compact.length, index + query.length + 160));
}

function encodeSpaceWorkId(name: string): string {
	return Buffer.from(name, "utf8").toString("base64url");
}

async function searchFiles(
	workspaceDir: string,
	query: string,
	types: Set<WorkspaceSearchType>,
): Promise<WorkspaceSearchResult[]> {
	const results: WorkspaceSearchResult[] = [];
	const q = query.toLowerCase();
	const realWorkspaceDir = await fs.realpath(workspaceDir).catch(() => workspaceDir);
	const visit = async (dir: string, depth: number): Promise<void> => {
		if (depth > 12) return;
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (SKIP_DIRS.has(entry.name)) continue;
			if (entry.isSymbolicLink()) continue;
			const target = path.join(dir, entry.name);
			if (!isAllowedPath(target, workspaceDir)) continue;
			const realTarget = await fs.realpath(target).catch(() => "");
			if (!realTarget || !isAllowedPath(realTarget, realWorkspaceDir)) continue;
			if (entry.isDirectory()) {
				await visit(target, depth + 1);
				continue;
			}
			if (!entry.isFile()) continue;
			const rel = relativePath(target, workspaceDir);
			const ext = path.extname(entry.name).toLowerCase();
			const type: WorkspaceSearchType = rel.startsWith("记忆/") ? "memory" : rel.startsWith("Wiki/") ? "wiki" : "file";
			if (!types.has(type) && !types.has("file")) continue;
			let content = "";
			if (TEXT_EXTENSIONS.has(ext)) {
				content = await fs.readFile(target, "utf-8").catch(() => "");
			}
			const haystack = `${entry.name}\n${rel}\n${content}`.toLowerCase();
			if (!haystack.includes(q)) continue;
			const stats = await fs.stat(target);
			results.push({
				id: `${type}:${rel}`,
				type,
				title: entry.name,
				path: rel,
				sourcePath: rel,
				updatedAt: Number(stats.mtimeMs),
				snippet: snippet(content || rel, query),
				score: scoreText(query, entry.name, content || rel, type, Number(stats.mtimeMs)),
			});
		}
	};
	await visit(workspaceDir, 0);
	return results;
}

function searchTasks(db: RidgeDatabase, workspaceDir: string, query: string): WorkspaceSearchResult[] {
	const q = `%${query.toLowerCase()}%`;
	const rows = db.prepare(
		`SELECT task_id, title, acceptance_criteria, status, priority, updated_at, project_id
		 FROM workspace_tasks
		 WHERE workspace_path = ?
		   AND (lower(title) LIKE ? OR lower(acceptance_criteria) LIKE ?)`,
	).all(workspaceDir, q, q) as Array<{
		task_id: string;
		title: string;
		acceptance_criteria: string;
		status: string;
		priority: string;
		updated_at: number;
		project_id: string | null;
	}>;
	return rows.map((row) => ({
		id: `task:${row.task_id}`,
		type: "task",
		title: row.title,
		targetId: row.task_id,
		projectId: row.project_id,
		updatedAt: row.updated_at,
		snippet: snippet(`${row.status} ${row.priority} ${row.acceptance_criteria}`, query),
		score: scoreText(query, row.title, row.acceptance_criteria, "task", row.updated_at),
	}));
}

function searchMilestones(db: RidgeDatabase, workspaceDir: string, query: string): WorkspaceSearchResult[] {
	const q = `%${query.toLowerCase()}%`;
	const rows = db.prepare(
		`SELECT milestone_id, title, goal, acceptance_criteria, updated_at, project_id
		 FROM workspace_milestones
		 WHERE workspace_path = ?
		   AND (lower(title) LIKE ? OR lower(goal) LIKE ? OR lower(acceptance_criteria) LIKE ?)`,
	).all(workspaceDir, q, q, q) as Array<{
		milestone_id: string;
		title: string;
		goal: string;
		acceptance_criteria: string;
		updated_at: number;
		project_id: string | null;
	}>;
	return rows.map((row) => ({
		id: `milestone:${row.milestone_id}`,
		type: "milestone",
		title: row.title,
		targetId: row.milestone_id,
		projectId: row.project_id,
		updatedAt: row.updated_at,
		snippet: snippet(`${row.goal} ${row.acceptance_criteria}`, query),
		score: scoreText(query, row.title, `${row.goal} ${row.acceptance_criteria}`, "milestone", row.updated_at),
	}));
}

function searchProjects(db: RidgeDatabase, workspaceDir: string, query: string): WorkspaceSearchResult[] {
	const q = `%${query.toLowerCase()}%`;
	const rows = db.prepare(
		`SELECT project_id, name, path, project_type, updated_at
		 FROM projects
		 WHERE workspace_path = ?
		   AND (lower(name) LIKE ? OR lower(path) LIKE ?)`,
	).all(workspaceDir, q, q) as Array<{
		project_id: string;
		name: string;
		path: string;
		project_type: string;
		updated_at: number;
	}>;
	return rows.map((row) => ({
		id: `project:${row.project_id}`,
		type: "project",
		title: row.name,
		targetId: row.project_id,
		projectId: row.project_id,
		path: row.path,
		updatedAt: row.updated_at,
		snippet: `${row.project_type} ${row.path}`,
		score: scoreText(query, row.name, row.path, "project", row.updated_at),
	}));
}

function loadProjectScopes(db: RidgeDatabase, workspaceDir: string): ProjectScope[] {
	const rows = db.prepare(
		`SELECT project_id, path
		 FROM projects
		 WHERE workspace_path = ?
		   AND archived_at IS NULL`,
	).all(workspaceDir) as Array<{ project_id: string; path: string }>;
	return rows
		.map((row) => {
			const rootPath = normalize(row.path);
			if (!isAllowedPath(rootPath, workspaceDir)) return null;
			return {
				projectId: row.project_id,
				rootPath,
				sourcePath: relativePath(rootPath, workspaceDir),
			};
		})
		.filter((item): item is ProjectScope => item !== null)
		.sort((left, right) => right.sourcePath.length - left.sourcePath.length);
}

function inferProjectId(result: WorkspaceSearchResult, scopes: ProjectScope[]): string | null {
	if (result.projectId) return result.projectId;
	const candidate = result.sourcePath ?? result.path;
	if (!candidate) return null;
	for (const scope of scopes) {
		if (path.isAbsolute(candidate)) {
			if (isSameOrChildPath(normalize(candidate), scope.rootPath)) return scope.projectId;
			continue;
		}
		if (isSameOrChildPath(candidate, scope.sourcePath)) return scope.projectId;
	}
	return null;
}

function attachProjectScopes(
	results: WorkspaceSearchResult[],
	scopes: ProjectScope[],
): WorkspaceSearchResult[] {
	if (scopes.length === 0) return results;
	return results.map((item) => {
		const projectId = inferProjectId(item, scopes);
		return projectId && projectId !== item.projectId
			? { ...item, projectId }
			: item;
	});
}

function searchSessions(db: RidgeDatabase, workspaceDir: string, query: string): WorkspaceSearchResult[] {
	const q = `%${query.toLowerCase()}%`;
	const rows = db.prepare(
		`SELECT session_id, title, project_id, task_id, updated_at
		 FROM session_index
		 WHERE workspace_path = ?
		   AND archived = 0
		   AND lower(title) LIKE ?`,
	).all(workspaceDir, q) as Array<{
		session_id: string;
		title: string;
		project_id: string | null;
		task_id: string | null;
		updated_at: number;
	}>;
	return rows.map((row) => ({
		id: `session:${row.session_id}`,
		type: "session",
		title: row.title,
		targetId: row.session_id,
		projectId: row.project_id,
		updatedAt: row.updated_at,
		snippet: row.task_id ? `任务 ${row.task_id}` : "工作空间会话",
		score: scoreText(query, row.title, row.task_id ?? "", "session", row.updated_at),
	}));
}

async function searchSpaces(workspaceDir: string, query: string): Promise<WorkspaceSearchResult[]> {
	const spaceRoot = path.join(workspaceDir, "空间");
	const q = query.toLowerCase();
	const dirents = await fs.readdir(spaceRoot, { withFileTypes: true }).catch(() => []);
	const results: WorkspaceSearchResult[] = [];
	for (const entry of dirents) {
		if (!entry.isDirectory()) continue;
		const indexPath = path.join(spaceRoot, entry.name, "index.html");
		const stats = await fs.stat(indexPath).catch(() => null);
		if (!stats?.isFile()) continue;
		const html = await fs.readFile(indexPath, "utf-8").catch(() => "");
		if (!`${entry.name}\n${html}`.toLowerCase().includes(q)) continue;
		const rel = relativePath(indexPath, workspaceDir);
		results.push({
			id: `space:${entry.name}`,
			type: "space",
			title: entry.name,
			path: rel,
			sourcePath: rel,
			targetId: encodeSpaceWorkId(entry.name),
			updatedAt: Number(stats.mtimeMs),
			snippet: snippet(html, query),
			score: scoreText(query, entry.name, html, "space", Number(stats.mtimeMs)),
		});
	}
	return results;
}

function mapRagResults(query: string, rows: RagSearchResult[]): WorkspaceSearchResult[] {
	return rows.map((row) => ({
		id: `rag:${row.targetPath}:${row.chunkIndex}`,
		type: "rag",
		title: row.headingPath.at(-1) || path.basename(row.sourcePath),
		path: row.sourcePath,
		sourcePath: row.sourcePath,
		updatedAt: row.updatedAt,
		snippet: row.preview,
		headingPath: row.headingPath,
		startLine: row.startLine,
		endLine: row.endLine,
		score: scoreText(query, row.headingPath.at(-1) || row.sourcePath, row.preview, "rag", row.updatedAt) + row.matchCount,
	}));
}

function getIndexStatus(db: RidgeDatabase, workspaceDir: string): WorkspaceSearchResponse["indexStatus"] {
	const rows = db.prepare(
		`SELECT status, COUNT(*) AS count
		 FROM search_index_status
		 WHERE workspace_path = ?
		    OR (workspace_path = '' AND (target_path = ? OR target_path LIKE ? ESCAPE '\\'))
		 GROUP BY status`,
	).all(workspaceDir, workspaceDir, workspaceTargetLike(workspaceDir)) as Array<{ status: string; count: number }>;
	const counts = new Map(rows.map((row) => [row.status, row.count]));
	return {
		pending: counts.get("pending") ?? 0,
		indexed: counts.get("indexed") ?? 0,
		indexFailed: counts.get("index_failed") ?? 0,
	};
}

async function fileSummary(filePath: string): Promise<{ exists: boolean; size: number; updatedAt: number | null; text: string }> {
	const stats = await fs.stat(filePath).catch(() => null);
	if (!stats?.isFile()) return { exists: false, size: 0, updatedAt: null, text: "" };
	const text = await fs.readFile(filePath, "utf-8").catch(() => "");
	return {
		exists: true,
		size: stats.size,
		updatedAt: Number(stats.mtimeMs),
		text,
	};
}

function stripTopHeading(text: string): string {
	return text.replace(/^#\s+[^\n]*\n?/, "").trim();
}

async function collectMarkdownStats(root: string): Promise<{ count: number; latestAt: number | null }> {
	let count = 0;
	let latestAt: number | null = null;
	const visit = async (dir: string): Promise<void> => {
		const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(fullPath);
				continue;
			}
			if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
			const stats = await fs.stat(fullPath).catch(() => null);
			if (!stats) continue;
			count += 1;
			const updatedAt = Number(stats.mtimeMs);
			latestAt = latestAt === null ? updatedAt : Math.max(latestAt, updatedAt);
		}
	};
	await visit(root);
	return { count, latestAt };
}

async function latestTreeMtime(root: string): Promise<number | null> {
	const stats = await fs.stat(root).catch(() => null);
	if (!stats) return null;
	let latest = Number(stats.mtimeMs);
	const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		const child = entry.isDirectory()
			? await latestTreeMtime(fullPath)
			: await fs.stat(fullPath).then((item) => Number(item.mtimeMs)).catch(() => null);
		if (child !== null) latest = Math.max(latest, child);
	}
	return latest;
}

function emptyJobCounts(): Record<JobStatus, number> {
	return { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
}

function getNotificationCounts(db: RidgeDatabase): WorkspaceKnowledgeDiagnosticsResponse["notifications"] {
	const unhandled = db.prepare(
		`SELECT COUNT(*) AS count
		 FROM notification_events
		 WHERE status NOT IN ('handled', 'dismissed')`,
	).get() as { count: number } | undefined;
	const ragFailures = db.prepare(
		`SELECT COUNT(*) AS count
		 FROM notification_events
		 WHERE event_type = 'rag.index_failed'
		   AND status NOT IN ('handled', 'dismissed')`,
	).get() as { count: number } | undefined;
	const backgroundFailures = db.prepare(
		`SELECT COUNT(*) AS count
		 FROM notification_events
		 WHERE event_type = 'background_job.failed'
		   AND status NOT IN ('handled', 'dismissed')`,
	).get() as { count: number } | undefined;
	return {
		unhandled: unhandled?.count ?? 0,
		ragFailures: ragFailures?.count ?? 0,
		backgroundFailures: backgroundFailures?.count ?? 0,
	};
}

function getBackgroundJobDiagnostics(db: RidgeDatabase): WorkspaceKnowledgeDiagnosticsResponse["backgroundJobs"] {
	const byStatus = emptyJobCounts();
	const statusRows = db.prepare(
		`SELECT status, COUNT(*) AS count
		 FROM background_jobs
		 GROUP BY status`,
	).all() as Array<{ status: JobStatus; count: number }>;
	for (const row of statusRows) {
		if (JOB_STATUSES.includes(row.status)) byStatus[row.status] = row.count;
	}

	const typeRows = db.prepare(
		`SELECT job_type, status, COUNT(*) AS count
		 FROM background_jobs
		 GROUP BY job_type, status
		 ORDER BY job_type ASC`,
	).all() as Array<{ job_type: string; status: JobStatus; count: number }>;
	const typeMap = new Map<string, Record<JobStatus, number> & { type: string }>();
	for (const row of typeRows) {
		const current = typeMap.get(row.job_type) ?? { type: row.job_type, ...emptyJobCounts() };
		if (JOB_STATUSES.includes(row.status)) current[row.status] = row.count;
		typeMap.set(row.job_type, current);
	}

	const recentFailures = db.prepare(
		`SELECT
		   job_id,
		   job_type,
		   related_type,
		   related_id,
		   last_error,
		   updated_at,
		   (
		     SELECT event_id
		     FROM notification_events
		     WHERE status NOT IN ('handled', 'dismissed')
		       AND (
		         (related_type = 'background_job' AND related_id = background_jobs.job_id)
		         OR related_id = background_jobs.related_id
		       )
		     ORDER BY created_at DESC
		     LIMIT 1
		   ) AS notification_id
		 FROM background_jobs
		 WHERE status = 'failed'
		 ORDER BY updated_at DESC
		 LIMIT 5`,
	).all() as Array<{
		job_id: string;
		job_type: string;
		related_type: string;
		related_id: string;
		last_error: string | null;
		updated_at: number;
		notification_id: string | null;
	}>;

	return {
		byStatus,
		byType: Array.from(typeMap.values()),
		recentFailures: recentFailures.map((row) => ({
			jobId: row.job_id,
			type: row.job_type,
			relatedType: row.related_type,
			relatedId: row.related_id,
			lastError: row.last_error ?? "",
			updatedAt: row.updated_at,
			notificationId: row.notification_id,
		})),
	};
}

function getRagDiagnostics(
	db: RidgeDatabase,
	workspaceDir: string,
): WorkspaceKnowledgeDiagnosticsResponse["rag"] {
	const status = getIndexStatus(db, workspaceDir);
	const latest = db.prepare(
		`SELECT MAX(indexed_at) AS latest_indexed_at
		 FROM search_index_status
		 WHERE workspace_path = ?
		    OR (workspace_path = '' AND (target_path = ? OR target_path LIKE ? ESCAPE '\\'))`,
	).get(workspaceDir, workspaceDir, workspaceTargetLike(workspaceDir)) as { latest_indexed_at: number | null } | undefined;
	const failedRows = db.prepare(
		`SELECT
		   target_path,
		   source_path,
		   error,
		   updated_at,
		   (
		     SELECT event_id
		     FROM notification_events
		     WHERE event_type = 'rag.index_failed'
		       AND status NOT IN ('handled', 'dismissed')
		       AND related_id = search_index_status.target_path
		     ORDER BY created_at DESC
		     LIMIT 1
		   ) AS notification_id
		 FROM search_index_status
		 WHERE status = 'index_failed'
		   AND (
		     workspace_path = ?
		     OR (workspace_path = '' AND (target_path = ? OR target_path LIKE ? ESCAPE '\\'))
		   )
		 ORDER BY updated_at DESC
		 LIMIT 8`,
	).all(workspaceDir, workspaceDir, workspaceTargetLike(workspaceDir)) as Array<{
		target_path: string;
		source_path: string;
		error: string | null;
		updated_at: number;
		notification_id: string | null;
	}>;

	return {
		...status,
		latestIndexedAt: latest?.latest_indexed_at ?? null,
		failedTargets: failedRows.map((row) => ({
			path: row.source_path || diagnosticsPath(row.target_path, workspaceDir),
			error: row.error ?? "",
			updatedAt: row.updated_at,
			notificationId: row.notification_id,
		})),
	};
}

async function getMemoryDiagnostics(workspaceDir: string): Promise<WorkspaceKnowledgeDiagnosticsResponse["memory"]> {
	const memoryPath = path.join(workspaceDir, "记忆", "MEMORY.md");
	const memory = await fileSummary(memoryPath);
	const daily = await collectMarkdownStats(path.join(workspaceDir, "记忆", "daily"));
	return {
		memoryPath: "记忆/MEMORY.md",
		exists: memory.exists,
		size: memory.size,
		updatedAt: memory.updatedAt,
		injected: stripTopHeading(memory.text).length > 0,
		dailyCount: daily.count,
		latestDailyAt: daily.latestAt,
	};
}

async function getWikiDiagnostics(
	db: RidgeDatabase,
	workspaceDir: string,
): Promise<WorkspaceKnowledgeDiagnosticsResponse["wiki"]> {
	const indexPath = path.join(workspaceDir, "Wiki", "index.md");
	const wiki = await fileSummary(indexPath);
	const statusRow = db.prepare(
		`SELECT status
		 FROM search_index_status
		 WHERE target_path = ?
		 LIMIT 1`,
	).get(indexPath) as { status: "pending" | "indexed" | "index_failed" } | undefined;
	return {
		indexPath: "Wiki/index.md",
		exists: wiki.exists,
		size: wiki.size,
		updatedAt: wiki.updatedAt,
		injected: stripTopHeading(wiki.text).length > 0,
		indexStatus: statusRow?.status ?? "missing",
	};
}

async function getGraphDiagnostics(workspaceDir: string): Promise<WorkspaceKnowledgeDiagnosticsResponse["graph"]> {
	const graphRoot = path.join(workspaceDir, ".ridge", "graph.kuzu");
	const schemaPath = path.join(graphRoot, "schema.cypher");
	const databasePath = path.join(graphRoot, "database.kuzu");
	const [schemaStats, databaseStats, updatedAt] = await Promise.all([
		fs.stat(schemaPath).catch(() => null),
		fs.stat(databasePath).catch(() => null),
		latestTreeMtime(graphRoot),
	]);
	return {
		graphPath: ".ridge/graph.kuzu",
		schemaExists: schemaStats?.isFile() === true,
		databaseExists: databaseStats?.isDirectory() === true || databaseStats?.isFile() === true,
		updatedAt,
		correctionsEndpoint: "/api/workspace/graph/corrections",
	};
}

export async function getWorkspaceKnowledgeDiagnostics(
	deps: WorkspaceSearchDeps,
): Promise<WorkspaceKnowledgeDiagnosticsResponse> {
	const workspaceDir = normalize(deps.defaultWorkspaceDir);
	const db = await deps.getRidgeDb();
	const [memory, wiki, graph] = await Promise.all([
		getMemoryDiagnostics(workspaceDir),
		getWikiDiagnostics(db, workspaceDir),
		getGraphDiagnostics(workspaceDir),
	]);

	return {
		rag: getRagDiagnostics(db, workspaceDir),
		memory,
		wiki,
		graph,
		mcp: {
			endpoint: "/api/workspace/mcp",
			boundary: "read_only_workspace_visible_assets",
			tools: MCP_TOOLS,
		},
		backgroundJobs: getBackgroundJobDiagnostics(db),
		notifications: getNotificationCounts(db),
	};
}

export function createWorkspaceSearchRouter(deps: WorkspaceSearchDeps) {
	const router = express.Router();

	router.get("/api/workspace/search", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const parsed = querySchema.parse(req.query ?? {});
			res.json(await searchWorkspace(deps, parsed));
		} catch (error) {
			next(error);
		}
	});

	router.post("/api/workspace/rag/refresh", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const parsed = refreshSchema.parse(req.body ?? {});
			const workspaceDir = normalize(deps.defaultWorkspaceDir);
			const targetPath = path.isAbsolute(parsed.path)
				? normalize(parsed.path)
				: normalize(path.join(workspaceDir, parsed.path));
			if (!await isAllowedResolvedPath(targetPath, workspaceDir)) {
				const error = new Error("RAG refresh target must stay inside workspace") as Error & { statusCode?: number };
				error.statusCode = 400;
				throw error;
			}
			const result = await refreshRagTarget(targetPath, { workspaceDir, event: "manual" });
			res.json(result);
		} catch (error) {
			next(error);
		}
	});

	router.get("/api/workspace/knowledge/diagnostics", async (_req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(await getWorkspaceKnowledgeDiagnostics(deps));
		} catch (error) {
			next(error);
		}
	});

	return router;
}

export async function searchWorkspace(
	deps: WorkspaceSearchDeps,
	parsed: WorkspaceSearchQuery,
): Promise<WorkspaceSearchResponse> {
	const workspaceDir = normalize(deps.defaultWorkspaceDir);
	const db = await deps.getRidgeDb();
	const types = parseTypes(parsed.type);
	const results: WorkspaceSearchResult[] = [];
	const projectScopes = loadProjectScopes(db, workspaceDir);

	if (types.has("file") || types.has("memory") || types.has("wiki")) {
		results.push(...await searchFiles(workspaceDir, parsed.q, types));
	}
	if (types.has("task")) results.push(...searchTasks(db, workspaceDir, parsed.q));
	if (types.has("milestone")) results.push(...searchMilestones(db, workspaceDir, parsed.q));
	if (types.has("project")) results.push(...searchProjects(db, workspaceDir, parsed.q));
	if (types.has("session")) results.push(...searchSessions(db, workspaceDir, parsed.q));
	if (types.has("space")) results.push(...await searchSpaces(workspaceDir, parsed.q));
	if (types.has("rag")) {
		results.push(...mapRagResults(parsed.q, await searchContent(parsed.q, {
			workspaceDir,
			limit: parsed.limit ?? 50,
		})));
	}

	const scopedResults = attachProjectScopes(results, projectScopes);
	const projectFiltered = parsed.project
		? scopedResults.filter((item) => item.projectId === parsed.project)
		: scopedResults;
	const filtered = projectFiltered
		.filter((item) => matchesTime(item.updatedAt, parsed.time))
		.filter((item) => matchesDir(item, parsed.dir))
		.filter((item) => types.has(item.type))
		.sort((left, right) => {
			if (parsed.sort === "updated") return right.updatedAt - left.updatedAt;
			return right.score - left.score || right.updatedAt - left.updatedAt;
		})
		.slice(0, parsed.limit ?? 100);

	const groupMap = new Map<WorkspaceSearchType, number>();
	for (const item of filtered) {
		groupMap.set(item.type, (groupMap.get(item.type) ?? 0) + 1);
	}
	const groups = Array.from(groupMap.entries()).map(([type, count]) => ({ type, count }));

	return {
		query: parsed.q,
		results: filtered,
		groups,
		indexStatus: getIndexStatus(db, workspaceDir),
	};
}
