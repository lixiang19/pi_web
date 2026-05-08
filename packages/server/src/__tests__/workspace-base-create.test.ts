import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "base-create-test");

beforeAll(async () => {
	api = await createAuthenticatedAgent(app);
	await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
});

describe("POST /api/workspace/base/create", () => {
	it("creates .base in workspace root when folder is empty", async () => {
		const res = await api
			.post("/api/workspace/base/create")
			.send({ name: "rootbase" });

		expect(res.status).toBe(200);
		expect(res.body.path).toBeDefined();

		// .base should be directly in the default workspace dir, not inside 数据库/
		const fullPath = path.join(WORKSPACE, res.body.path);
		const stat = await fs.stat(fullPath);
		expect(stat.isFile()).toBe(true);
		expect(res.body.path).not.toContain("数据库");

		// cleanup
		await fs.unlink(fullPath).catch(() => {});
	});

	it("creates .base in the specified folder when folder is provided", async () => {
		const subDir = path.join(TEST_ROOT, "my-subdir");
		await fs.mkdir(subDir, { recursive: true });

		const res = await api
			.post("/api/workspace/base/create")
			.send({ name: "folderbase", folder: "base-create-test/my-subdir" });

		expect(res.status).toBe(200);
		expect(res.body.path).toContain("base-create-test/my-subdir");

		const fullPath = path.join(WORKSPACE, res.body.path);
		const stat = await fs.stat(fullPath);
		expect(stat.isFile()).toBe(true);

		// cleanup
		await fs.unlink(fullPath).catch(() => {});
	});

	it("returns valid base data with expected structure", async () => {
		const res = await api
			.post("/api/workspace/base/create")
			.send({ name: "structuretest" });

		expect(res.status).toBe(200);
		const data = res.body.data;
		expect(data).toBeDefined();
		expect(data.name).toBe("structuretest");
		expect(Array.isArray(data.columns)).toBe(true);
		expect(Array.isArray(data.rows)).toBe(true);
		expect(Array.isArray(data.views)).toBe(true);
		expect(data.activeViewId).toBe(data.views[0]?.id);

		// cleanup
		const fullPath = path.join(WORKSPACE, res.body.path);
		await fs.unlink(fullPath).catch(() => {});
	});
});
