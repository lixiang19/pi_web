import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import type { RidgeDatabase } from "../db/index.js";
import { authenticateDeviceToken } from "../devices.js";
import { searchContent } from "../rag-indexer.js";
import { searchWorkspace } from "./workspace-search.js";
import { toPosixPath } from "../utils/paths.js";

export interface WorkspaceMcpDeps {
	defaultWorkspaceDir: string;
	getRidgeDb: () => Promise<RidgeDatabase>;
}

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: JsonRpcId;
	method: string;
	params?: unknown;
}

interface McpTool {
	name: "rag_search" | "graph_search" | "file_search" | "read_workspace_file";
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

interface McpToolResult {
	content: Array<{ type: "text"; text: string }>;
	structuredContent: Record<string, unknown>;
	isError?: boolean;
}

const MAX_READ_BYTES = 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
	".css",
	".csv",
	".html",
	".htm",
	".js",
	".json",
	".jsx",
	".md",
	".markdown",
	".mjs",
	".ts",
	".tsx",
	".txt",
	".vue",
	".xml",
	".yaml",
	".yml",
]);

const TOOL_DEFINITIONS: McpTool[] = [
	{
		name: "rag_search",
		title: "Search workspace RAG chunks",
		description: "Search indexed workspace content and return grounded snippets. Read-only.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", minLength: 1 },
				limit: { type: "integer", minimum: 1, maximum: 50 },
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
	{
		name: "graph_search",
		title: "Search workspace graph",
		description: "Search the workspace graph index when it exists. Read-only.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", minLength: 1 },
				limit: { type: "integer", minimum: 1, maximum: 50 },
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
	{
		name: "file_search",
		title: "Search visible workspace files",
		description: "Search visible workspace files, memory, wiki, and space files. Read-only.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", minLength: 1 },
				limit: { type: "integer", minimum: 1, maximum: 50 },
				dir: { type: "string" },
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
	{
		name: "read_workspace_file",
		title: "Read a visible workspace file",
		description: "Read visible workspace files and formal attachments. Hidden, temporary, and external paths are rejected. Read-only.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", minLength: 1 },
			},
			required: ["path"],
			additionalProperties: false,
		},
	},
];

const searchArgsSchema = z.object({
	query: z.string().trim().min(1).max(200),
	limit: z.coerce.number().int().min(1).max(50).optional(),
	dir: z.string().trim().optional(),
});

const readArgsSchema = z.object({
	path: z.string().trim().min(1),
});

const toolCallSchema = z.object({
	name: z.enum(["rag_search", "graph_search", "file_search", "read_workspace_file"]),
	arguments: z.record(z.string(), z.unknown()).optional(),
});

function extractDeviceToken(req: Request): string | undefined {
	const auth = req.headers.authorization;
	if (auth?.startsWith("Bearer ")) {
		const token = auth.slice("Bearer ".length).trim();
		if (token) {
			return token;
		}
	}
	const headerToken = req.headers["x-ridge-device-token"];
	return typeof headerToken === "string" ? headerToken.trim() : undefined;
}

function jsonRpcResult(id: JsonRpcId | undefined, result: unknown) {
	return { jsonrpc: "2.0", id: id ?? null, result };
}

function jsonRpcError(id: JsonRpcId | undefined, code: number, message: string) {
	return {
		jsonrpc: "2.0",
		id: id ?? null,
		error: { code, message },
	};
}

function invalidParams(id: JsonRpcId | undefined, error: unknown) {
	const detail = error instanceof z.ZodError
		? error.issues.map((issue) => issue.message).join("; ")
		: error instanceof Error
			? error.message
			: "Invalid params";
	return jsonRpcError(id, -32602, detail || "Invalid params");
}

function toolResult(payload: Record<string, unknown>): McpToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
	};
}

function toolError(message: string): McpToolResult {
	const payload = { error: message };
	return {
		content: [{ type: "text", text: message }],
		structuredContent: payload,
		isError: true,
	};
}

function normalizeWorkspaceDir(workspaceDir: string): string {
	return toPosixPath(path.resolve(workspaceDir));
}

function relativeWorkspacePath(targetPath: string, workspaceDir: string): string {
	return toPosixPath(path.relative(workspaceDir, targetPath));
}

function isInsideWorkspace(targetPath: string, workspaceDir: string): boolean {
	const rel = path.relative(workspaceDir, targetPath);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function hasHiddenSegment(relativePath: string): boolean {
	return relativePath
		.split("/")
		.filter(Boolean)
		.some((segment) => segment.startsWith("."));
}

async function resolveReadableWorkspaceFile(workspaceDir: string, inputPath: string) {
	const normalizedWorkspaceDir = normalizeWorkspaceDir(workspaceDir);
	const targetPath = path.isAbsolute(inputPath)
		? toPosixPath(path.resolve(inputPath))
		: toPosixPath(path.resolve(normalizedWorkspaceDir, inputPath));

	if (!isInsideWorkspace(targetPath, normalizedWorkspaceDir)) {
		throw new Error("File must stay inside workspace");
	}

	const relativePath = relativeWorkspacePath(targetPath, normalizedWorkspaceDir);
	if (!relativePath || hasHiddenSegment(relativePath)) {
		throw new Error("File is not a visible workspace path");
	}

	const [realWorkspaceDir, realTargetPath] = await Promise.all([
		fs.realpath(normalizedWorkspaceDir).then(normalizeWorkspaceDir),
		fs.realpath(targetPath).then(normalizeWorkspaceDir),
	]);
	if (!isInsideWorkspace(realTargetPath, realWorkspaceDir)) {
		throw new Error("Resolved file must stay inside workspace");
	}
	const realRelativePath = relativeWorkspacePath(realTargetPath, realWorkspaceDir);
	if (!realRelativePath || hasHiddenSegment(realRelativePath)) {
		throw new Error("Resolved file is not a visible workspace path");
	}

	const stats = await fs.stat(realTargetPath);
	if (!stats.isFile()) {
		throw new Error("Workspace path is not readable as a file");
	}
	return { targetPath: realTargetPath, relativePath, stats };
}

function isTextPath(filePath: string): boolean {
	return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function readWorkspaceFile(workspaceDir: string, args: unknown): Promise<McpToolResult> {
	const parsed = readArgsSchema.parse(args ?? {});
	try {
		const resolved = await resolveReadableWorkspaceFile(workspaceDir, parsed.path);
		const handle = await fs.open(resolved.targetPath, "r");
		try {
			const readLength = Math.min(resolved.stats.size, MAX_READ_BYTES);
			const buffer = Buffer.alloc(readLength);
			const { bytesRead } = await handle.read(buffer, 0, readLength, 0);
			const contentBuffer = buffer.subarray(0, bytesRead);
			const truncated = resolved.stats.size > MAX_READ_BYTES;
			const text = isTextPath(resolved.targetPath);
			return toolResult({
				path: resolved.relativePath,
				title: path.basename(resolved.relativePath),
				updatedAt: Number(resolved.stats.mtimeMs),
				size: resolved.stats.size,
				encoding: text ? "utf-8" : "base64",
				content: text ? contentBuffer.toString("utf-8") : contentBuffer.toString("base64"),
				truncated,
				sourceType: "file",
			});
		} finally {
			await handle.close();
		}
	} catch (error) {
		return toolError(error instanceof Error ? error.message : "File is not readable");
	}
}

async function ragSearch(workspaceDir: string, args: unknown): Promise<McpToolResult> {
	const parsed = searchArgsSchema.parse(args ?? {});
	const rows = await searchContent(parsed.query, {
		workspaceDir,
		limit: parsed.limit ?? 10,
	});
	return toolResult({
		query: parsed.query,
		results: rows.map((row) => ({
			snippet: row.preview,
			title: row.headingPath.at(-1) || path.basename(row.sourcePath),
			path: row.sourcePath,
			updatedAt: row.updatedAt,
			sourceType: "rag",
			score: row.matchCount,
			headingPath: row.headingPath,
			startLine: row.startLine,
			endLine: row.endLine,
			fileType: row.fileType,
		})),
	});
}

async function fileSearch(deps: WorkspaceMcpDeps, args: unknown): Promise<McpToolResult> {
	const parsed = searchArgsSchema.parse(args ?? {});
	const response = await searchWorkspace(deps, {
		q: parsed.query,
		type: "file,memory,wiki,space",
		limit: parsed.limit ?? 10,
		dir: parsed.dir,
	});
	return toolResult({
		query: parsed.query,
		results: response.results.map((row) => ({
			snippet: row.snippet,
			title: row.title,
			path: row.path ?? row.sourcePath,
			updatedAt: row.updatedAt,
			sourceType: row.type,
			score: row.score,
		})),
	});
}

async function graphSearch(workspaceDir: string, args: unknown): Promise<McpToolResult> {
	const parsed = searchArgsSchema.parse(args ?? {});
	const graphDir = path.join(workspaceDir, ".ridge", "graph.kuzu");
	const exists = await fs.stat(graphDir).then((stats) => stats.isDirectory(), () => false);
	return toolResult({
		query: parsed.query,
		results: [],
		sourceType: "graph",
		graphAvailable: exists,
	});
}

async function callTool(deps: WorkspaceMcpDeps, params: unknown): Promise<McpToolResult> {
	const parsed = toolCallSchema.parse(params ?? {});
	switch (parsed.name) {
		case "rag_search":
			return ragSearch(deps.defaultWorkspaceDir, parsed.arguments);
		case "graph_search":
			return graphSearch(deps.defaultWorkspaceDir, parsed.arguments);
		case "file_search":
			return fileSearch(deps, parsed.arguments);
		case "read_workspace_file":
			return readWorkspaceFile(deps.defaultWorkspaceDir, parsed.arguments);
		default:
			return toolError("Unknown tool");
	}
}

async function handleJsonRpc(deps: WorkspaceMcpDeps, request: JsonRpcRequest) {
	if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
		return jsonRpcError(request.id, -32600, "Invalid JSON-RPC request");
	}
	if (request.method === "initialize") {
		return jsonRpcResult(request.id, {
			protocolVersion: "2025-06-18",
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: "ridge-workspace", version: "1.0.0" },
		});
	}
	if (request.method === "tools/list") {
		return jsonRpcResult(request.id, { tools: TOOL_DEFINITIONS });
	}
	if (request.method === "tools/call") {
		try {
			return jsonRpcResult(request.id, await callTool(deps, request.params));
		} catch (error) {
			if (error instanceof z.ZodError) {
				return invalidParams(request.id, error);
			}
			throw error;
		}
	}
	return jsonRpcError(request.id, -32601, `Unknown method: ${request.method}`);
}

export function createWorkspaceMcpRouter(deps: WorkspaceMcpDeps) {
	const router = express.Router();

	router.post("/api/workspace/mcp", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const db = await deps.getRidgeDb();
			const device = authenticateDeviceToken(db, extractDeviceToken(req));
			if (!device) {
				res.status(401).json({ error: "Unauthorized device" });
				return;
			}

			const body = req.body as JsonRpcRequest | undefined;
			if (!body || typeof body !== "object") {
				res.status(400).json(jsonRpcError(null, -32600, "Invalid JSON-RPC request"));
				return;
			}
			if (!("id" in body)) {
				res.status(204).end();
				return;
			}
			res.json(await handleJsonRpc(deps, body));
		} catch (error) {
			next(error);
		}
	});

	return router;
}
