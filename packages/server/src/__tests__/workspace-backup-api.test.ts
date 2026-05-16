import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getRidgeDb } from "../db/index.js";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const CREATED_PATHS = [
	path.join(WORKSPACE, ".ridge", "graph.kuzu", "schema.cypher"),
	path.join(WORKSPACE, ".ridge", "rag", "chunk-cache.json"),
	path.join(WORKSPACE, "backup-api-marker.md"),
];

beforeAll(async () => {
	api = await createAuthenticatedAgent(app);
	await getRidgeDb();
	await fs.mkdir(path.join(WORKSPACE, ".ridge", "graph.kuzu"), { recursive: true });
	await fs.mkdir(path.join(WORKSPACE, ".ridge", "rag"), { recursive: true });
	await fs.writeFile(CREATED_PATHS[0]!, "CREATE NODE TABLE Project", "utf-8");
	await fs.writeFile(CREATED_PATHS[1]!, "rebuildable", "utf-8");
	await fs.writeFile(CREATED_PATHS[2]!, "# Backup marker", "utf-8");
});

afterAll(async () => {
	await Promise.all(CREATED_PATHS.map((targetPath) => fs.rm(targetPath, { force: true })));
});

describe("GET /api/workspace/backup", () => {
	it("requires API authentication", async () => {
		const res = await request(app).get("/api/workspace/backup");
		expect(res.status).toBe(401);
	});

	it("downloads a backup zip containing Kuzu graph storage but not rebuildable caches", async () => {
		const res = await api
			.get("/api/workspace/backup")
			.responseType("blob");

		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toBe("application/zip");
		expect(String(res.headers["content-disposition"])).toContain("ridge-backup-");

		const zip = await JSZip.loadAsync(res.body as Buffer);
		expect(zip.file("server/ridge.db")).not.toBeNull();
		expect(zip.file("workspace/backup-api-marker.md")).not.toBeNull();
		expect(zip.file("workspace/.ridge/graph.kuzu/schema.cypher")).not.toBeNull();
		expect(zip.file("workspace/.ridge/rag/chunk-cache.json")).toBeNull();
	});
});

describe("POST /api/workspace/restore", () => {
	it("requires API authentication", async () => {
		const res = await request(app)
			.post("/api/workspace/restore")
			.set("Content-Type", "application/zip")
			.send(Buffer.from("not-a-zip"));

		expect(res.status).toBe(401);
	});

	it("restores a downloaded backup and reports snapshot plus rebuild status", async () => {
		const backupRes = await api
			.get("/api/workspace/backup")
			.responseType("blob");
		expect(backupRes.status).toBe(200);

		await fs.writeFile(path.join(WORKSPACE, "restore-api-before.md"), "# Before", "utf-8");

		const restoreRes = await api
			.post("/api/workspace/restore")
			.set("Content-Type", "application/zip")
			.send(backupRes.body as Buffer);

		expect(restoreRes.status).toBe(200);
		expect(restoreRes.body).toMatchObject({
			ok: true,
			restoredFiles: expect.arrayContaining(["server/ridge.db"]),
			rebuildStatus: { rag: "pending", search_chunks: "pending" },
			preRestoreSnapshotPath: expect.stringContaining("pre-restore"),
		});
		expect(await fs.access(restoreRes.body.preRestoreSnapshotPath)).toBeUndefined();
		await expect(fs.access(path.join(WORKSPACE, "restore-api-before.md"))).rejects.toThrow();
	});
});
