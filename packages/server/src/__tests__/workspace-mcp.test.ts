import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRidgeDb } from "../db/index.js";
import { registerDevice } from "../devices.js";
import { createAuthRuntime } from "../auth.js";
import { createWorkspaceMcpRouter } from "../routes/workspace-mcp.js";
import { createDeviceRegistrationRouter, createRuntimeBundleRouter } from "../routes/runtime-bundle.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "workspace-mcp-test");
const EXTERNAL_ROOT = path.join(os.tmpdir(), "ridge-workspace-mcp-external");

async function cleanDb() {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM devices WHERE device_id LIKE 'mcp-test-%'").run();
	db.prepare("DELETE FROM projects WHERE workspace_path = ? OR path LIKE ?").run(TEST_ROOT, `${EXTERNAL_ROOT}%`);
	db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
}

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use(createRuntimeBundleRouter({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }));
	app.use(createWorkspaceMcpRouter({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }));
	app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
		const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
			? (error as { statusCode: number }).statusCode
			: 500;
		res.status(statusCode).json({ error: error instanceof Error ? error.message : "Unknown server error" });
	});
	return app;
}

function createDeviceRegistrationTestApp() {
	const auth = createAuthRuntime({ adminPassword: "ridge-admin" });
	const app = express();
	app.use(express.json());
	app.post("/api/auth/login", auth.login);
	app.use(auth.requireApiAuth);
	app.use(createDeviceRegistrationRouter({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }));
	app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
		const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
			? (error as { statusCode: number }).statusCode
			: 500;
		res.status(statusCode).json({ error: error instanceof Error ? error.message : "Unknown server error" });
	});
	return app;
}

async function registerTestDevice(deviceId = "mcp-test-device") {
	const db = await getRidgeDb();
	return registerDevice(db, {
		deviceId,
		name: "MCP Test Desktop",
		deviceType: "desktop",
		capabilities: { platform: "darwin" },
	});
}

async function callTool(
	app: ReturnType<typeof createTestApp>,
	token: string,
	name: string,
	args: Record<string, unknown>,
	headerName: "authorization" | "x-ridge-device-token" = "authorization",
) {
	const pending = request(app).post("/api/workspace/mcp");
	if (headerName === "authorization") {
		pending.set("Authorization", `Bearer ${token}`);
	} else {
		pending.set("x-ridge-device-token", token);
	}
	return pending.send({
			jsonrpc: "2.0",
			id: `${name}-1`,
			method: "tools/call",
			params: { name, arguments: args },
		});
}

function readStructuredContent(res: request.Response) {
	return res.body.result.structuredContent as Record<string, unknown>;
}

describe("workspace MCP", () => {
	beforeEach(async () => {
		vi.unstubAllEnvs();
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		await fs.rm(EXTERNAL_ROOT, { recursive: true, force: true });
		await fs.mkdir(path.join(TEST_ROOT, "笔记"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "附件"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "项目", "internal-alpha"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, ".ridge", "fleeting-attachments", "note-1"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "附件", ".originals"), { recursive: true });
		await fs.mkdir(EXTERNAL_ROOT, { recursive: true });

		await cleanDb();
		await fs.writeFile(path.join(TEST_ROOT, "笔记", "a.md"), "# Alpha Note\n\nvisible-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "附件", "formal.txt"), "formal attachment token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "项目", "internal-alpha", "spec.md"), "# Internal\n\ninternal-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, ".ridge", "secret.txt"), "hidden-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, ".ridge", "fleeting-attachments", "note-1", "temp.txt"), "temp-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "附件", ".originals", "formal.txt"), "original-token", "utf-8");
		await fs.writeFile(path.join(EXTERNAL_ROOT, "external.md"), "# External\n\nexternal-leak-token", "utf-8");
		await fs.symlink(EXTERNAL_ROOT, path.join(TEST_ROOT, "external-link"), "dir").catch(() => undefined);

		const now = Date.now();
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(
				project_id, name, path, is_git, added_at, project_type, external_origin,
				workspace_path, device_id, archived_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("mcp-internal-project", "Internal Alpha", path.join(TEST_ROOT, "项目", "internal-alpha"), 0, now, "internal", null, TEST_ROOT, null, null, now);
		db.prepare(
			`INSERT INTO projects(
				project_id, name, path, is_git, added_at, project_type, external_origin,
				workspace_path, device_id, archived_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("mcp-external-project", "External Alpha", EXTERNAL_ROOT, 0, now, "external", "folder", TEST_ROOT, null, null, now);
		db.prepare(
			`INSERT INTO search_index_status(
				target_path, target_type, status, workspace_path, source_path, refresh_policy,
				last_event, content_hash, indexed_at, error, updated_at
			) VALUES(?, 'file', 'indexed', ?, ?, 'immediate', 'manual', ?, ?, NULL, ?)`,
		).run(path.join(TEST_ROOT, "笔记", "a.md"), TEST_ROOT, "笔记/a.md", "hash-a", now, now);
		db.prepare(
			`INSERT INTO search_chunks(
				chunk_id, target_path, source_path, heading_path, chunk_index, chunk_text,
				content_hash, file_type, embedding_id, embedding_vector, start_line, end_line,
				created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"mcp-chunk-a",
			path.join(TEST_ROOT, "笔记", "a.md"),
			"笔记/a.md",
			JSON.stringify(["Alpha Note"]),
			0,
			"Alpha Note visible-token rag snippet",
			"hash-a",
			"markdown",
			"",
			"[]",
			1,
			3,
			now,
			now,
		);
	});

	afterAll(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		await fs.rm(EXTERNAL_ROOT, { recursive: true, force: true });
		await cleanDb();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("registers devices only through authenticated admin API and stores only a token hash", async () => {
		const app = createDeviceRegistrationTestApp();

		const unauthorized = await request(app).post("/api/devices/register").send({
			deviceId: "mcp-test-registered",
			name: "Desktop",
			deviceType: "desktop",
		});
		expect(unauthorized.status).toBe(401);

		const agent = request.agent(app);
		const login = await agent.post("/api/auth/login").send({ password: "ridge-admin" });
		expect(login.status).toBe(200);

		const registered = await agent.post("/api/devices/register").send({
			deviceId: "mcp-test-registered",
			name: "Desktop",
			deviceType: "desktop",
			capabilities: { platform: "darwin" },
		});
		expect(registered.status).toBe(201);
		expect(registered.body.token).toMatch(/^rdt_/);
		expect(registered.body.device).toMatchObject({
			deviceId: "mcp-test-registered",
			name: "Desktop",
			deviceType: "desktop",
			status: "online",
		});
		expect(registered.body.runtimeBundle.mcp.servers.ridge_workspace.headers.Authorization)
			.toBe(`Bearer ${registered.body.token}`);
		expect(registered.body.runtimeBundle.mcp.servers.ridge_workspace.headers["x-ridge-device-token"])
			.toBe(registered.body.token);

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT token_hash FROM devices WHERE device_id = ?")
			.get("mcp-test-registered") as { token_hash: string } | undefined;
		expect(row?.token_hash).toHaveLength(64);
		expect(row?.token_hash).not.toBe(registered.body.token);

		const rotated = await agent.post("/api/devices/register").send({
			deviceId: "mcp-test-registered",
			name: "Desktop",
			deviceType: "desktop",
		});
		expect(rotated.status).toBe(201);
		expect(rotated.body.token).not.toBe(registered.body.token);
		const rotatedRow = db
			.prepare("SELECT token_hash FROM devices WHERE device_id = ?")
			.get("mcp-test-registered") as { token_hash: string } | undefined;
		expect(rotatedRow?.token_hash).toHaveLength(64);
		expect(rotatedRow?.token_hash).not.toBe(row?.token_hash);

		const mcpApp = createTestApp();
		const oldTokenRes = await request(mcpApp)
			.post("/api/workspace/mcp")
			.set("Authorization", `Bearer ${registered.body.token}`)
			.send({ jsonrpc: "2.0", id: "old-token", method: "tools/list" });
		expect(oldTokenRes.status).toBe(401);
	});

	it("requires a device token and exposes only read/search tools", async () => {
		const app = createTestApp();
		const unauthorized = await request(app).post("/api/workspace/mcp").send({
			jsonrpc: "2.0",
			id: "tools-unauth",
			method: "tools/list",
		});
		expect(unauthorized.status).toBe(401);

		const { token } = await registerTestDevice();
		const res = await request(app)
			.post("/api/workspace/mcp")
			.set("Authorization", `Bearer ${token}`)
			.send({ jsonrpc: "2.0", id: "tools", method: "tools/list" });

		expect(res.status).toBe(200);
		const toolNames = res.body.result.tools.map((tool: { name: string }) => tool.name);
		expect(toolNames).toEqual(["rag_search", "graph_search", "file_search", "read_workspace_file"]);
		expect(toolNames.some((name: string) => /write|save|delete|update/i.test(name))).toBe(false);
	});

	it("supports MCP initialize, unknown method errors, and x-ridge-device-token auth", async () => {
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-jsonrpc-device");

		const initialize = await request(app)
			.post("/api/workspace/mcp")
			.set("Authorization", "Bearer   ")
			.set("x-ridge-device-token", token)
			.send({ jsonrpc: "2.0", id: "init", method: "initialize" });
		expect(initialize.status).toBe(200);
		expect(initialize.body.result).toMatchObject({
			protocolVersion: "2025-06-18",
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: "ridge-workspace" },
		});

		const unknown = await request(app)
			.post("/api/workspace/mcp")
			.set("x-ridge-device-token", token)
			.send({ jsonrpc: "2.0", id: "unknown", method: "resources/list" });
		expect(unknown.status).toBe(200);
		expect(unknown.body.error).toMatchObject({
			code: -32601,
			message: "Unknown method: resources/list",
		});

		const headerTool = await callTool(app, token, "rag_search", { query: "visible-token" }, "x-ridge-device-token");
		expect(headerTool.status).toBe(200);
		expect(readStructuredContent(headerTool)).toMatchObject({ query: "visible-token" });

		const invalidParams = await request(app)
			.post("/api/workspace/mcp")
			.set("x-ridge-device-token", token)
			.send({
				jsonrpc: "2.0",
				id: "invalid-params",
				method: "tools/call",
				params: { name: "rag_search", arguments: {} },
			});
		expect(invalidParams.status).toBe(200);
		expect(invalidParams.body.error).toMatchObject({ code: -32602 });
		expect(invalidParams.body.result).toBeUndefined();

		const nonObjectParams = await request(app)
			.post("/api/workspace/mcp")
			.set("x-ridge-device-token", token)
			.send({
				jsonrpc: "2.0",
				id: "invalid-non-object-params",
				method: "tools/call",
				params: "bad",
			});
		expect(nonObjectParams.status).toBe(200);
		expect(nonObjectParams.body.error).toMatchObject({ code: -32602 });
		expect(nonObjectParams.body.result).toBeUndefined();

		const unknownTool = await request(app)
			.post("/api/workspace/mcp")
			.set("x-ridge-device-token", token)
			.send({
				jsonrpc: "2.0",
				id: "invalid-tool-name",
				method: "tools/call",
				params: { name: "not_real" },
			});
		expect(unknownTool.status).toBe(200);
		expect(unknownTool.body.error).toMatchObject({ code: -32602 });
		expect(unknownTool.body.result).toBeUndefined();
	});

	it("reads visible workspace files and formal attachments but rejects hidden/temp/external paths", async () => {
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-read-device");

		const noteRes = await callTool(app, token, "read_workspace_file", { path: "笔记/a.md" });
		expect(noteRes.status).toBe(200);
		expect(readStructuredContent(noteRes)).toMatchObject({
			path: "笔记/a.md",
			encoding: "utf-8",
			content: "# Alpha Note\n\nvisible-token",
		});

		const attachmentRes = await callTool(app, token, "read_workspace_file", { path: "附件/formal.txt" });
		expect(attachmentRes.status).toBe(200);
		expect(readStructuredContent(attachmentRes)).toMatchObject({
			path: "附件/formal.txt",
			content: "formal attachment token",
		});

		for (const blockedPath of [
			".ridge/secret.txt",
			".ridge/fleeting-attachments/note-1/temp.txt",
			"附件/.originals/formal.txt",
			"external-link/external.md",
			path.join(EXTERNAL_ROOT, "external.md"),
		]) {
			const res = await callTool(app, token, "read_workspace_file", { path: blockedPath });
			expect(res.status).toBe(200);
			expect(res.body.result.isError).toBe(true);
			expect(res.body.result.structuredContent.error).toMatch(/not readable|inside workspace|visible/i);
		}
	});

	it("returns normalized RAG and file search results without leaking external project files", async () => {
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-search-device");

		const ragRes = await callTool(app, token, "rag_search", { query: "visible-token", limit: 5 });
		expect(ragRes.status).toBe(200);
		expect(readStructuredContent(ragRes)).toMatchObject({
			query: "visible-token",
		});
		const ragResults = readStructuredContent(ragRes).results as Array<Record<string, unknown>>;
		expect(ragResults[0]).toMatchObject({
			snippet: expect.stringContaining("visible-token"),
			title: "Alpha Note",
			path: "笔记/a.md",
			sourceType: "rag",
			score: expect.any(Number),
			updatedAt: expect.any(Number),
		});

		const fileRes = await callTool(app, token, "file_search", { query: "internal-token", limit: 10 });
		expect(fileRes.status).toBe(200);
		const fileResults = readStructuredContent(fileRes).results as Array<Record<string, unknown>>;
		expect(fileResults.some((item) => item.path === "项目/internal-alpha/spec.md")).toBe(true);

		const externalRes = await callTool(app, token, "file_search", { query: "external-leak-token", limit: 10 });
		expect(externalRes.status).toBe(200);
		expect(readStructuredContent(externalRes)).toMatchObject({ results: [] });

		const graphRes = await callTool(app, token, "graph_search", { query: "internal-token", limit: 5 });
		expect(graphRes.status).toBe(200);
		expect(readStructuredContent(graphRes)).toMatchObject({
			query: "internal-token",
			results: [],
			sourceType: "graph",
			graphAvailable: false,
		});
	});

	it("adds authenticated workspace MCP config to the runtime bundle", async () => {
		vi.stubEnv("RIDGE_PUBLIC_BASE_URL", "https://ridge.example.test");
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-bundle-device");
		const res = await request(app)
			.get("/api/runtime/bundle")
			.set("Authorization", "Bearer   ")
			.set("x-ridge-device-token", token)
			.set("Host", "malicious.example.test");

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			deviceId: "mcp-test-bundle-device",
			mcp: {
				servers: {
					ridge_workspace: {
						transport: "streamable_http",
						url: "https://ridge.example.test/api/workspace/mcp",
						headers: {
							Authorization: `Bearer ${token}`,
							"x-ridge-device-token": token,
						},
						tools: ["rag_search", "graph_search", "file_search", "read_workspace_file"],
					},
				},
			},
		});
	});

	it("rejects non-local runtime bundle hosts when no public base URL is configured", async () => {
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-host-device");
		const res = await request(app)
			.get("/api/runtime/bundle")
			.set("Authorization", `Bearer ${token}`)
			.set("Host", "evil.example.test");

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/RIDGE_PUBLIC_BASE_URL is required/);
	});

	it("rejects invalid public runtime bundle base URLs with a client error", async () => {
		vi.stubEnv("RIDGE_PUBLIC_BASE_URL", "not a url");
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-invalid-base-device");
		const res = await request(app)
			.get("/api/runtime/bundle")
			.set("Authorization", `Bearer ${token}`);

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/RIDGE_PUBLIC_BASE_URL must be a valid URL/);
	});

	it("rejects public runtime bundle base URLs with path, query, or hash", async () => {
		vi.stubEnv("RIDGE_PUBLIC_BASE_URL", "https://ridge.example.test/base/path");
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-path-base-device");
		const res = await request(app)
			.get("/api/runtime/bundle")
			.set("Authorization", `Bearer ${token}`);

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/must be an origin without path, query, or hash/);
	});

	it("rejects public runtime bundle base URLs with embedded credentials", async () => {
		vi.stubEnv("RIDGE_PUBLIC_BASE_URL", "https://user:pass@ridge.example.test");
		const app = createTestApp();
		const { token } = await registerTestDevice("mcp-test-credential-base-device");
		const res = await request(app)
			.get("/api/runtime/bundle")
			.set("Authorization", `Bearer ${token}`);

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/RIDGE_PUBLIC_BASE_URL must not include credentials/);
	});
});
