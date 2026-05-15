import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, setConversionEnabledForTesting } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";
import { searchContent } from "../rag-indexer.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "upload-trigger-test");

beforeAll(async () => {
	setConversionEnabledForTesting(true);
	api = await createAuthenticatedAgent(app);
	await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM background_jobs WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
	db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
});

describe("upload auto-enqueue conversion", () => {
	it("does NOT enqueue when conversion service is disabled via real upload API", async () => {
		setConversionEnabledForTesting(false);
		const tmpDir = path.join(TEST_ROOT, "tmp-disabled");
		await fs.mkdir(tmpDir, { recursive: true });
		const fileName = `disabled-${Date.now()}.pdf`;

		const db = await getRidgeDb();
		const beforeJobs = db.prepare("SELECT COUNT(*) as count FROM background_jobs").get() as { count: number };

		// Real upload via API
		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", tmpDir)
			.attach("files", Buffer.from("hello upload"), fileName);

		expect(res.status).toBe(201);
		expect(res.body.entries).toHaveLength(1);

		// No new background job should have been created
		const afterJobs = db.prepare("SELECT COUNT(*) as count FROM background_jobs").get() as { count: number };
		expect(afterJobs.count).toBe(beforeJobs.count);

		// Status record should still be created as pending
		const uploadedPath = res.body.entries[0].path;
		const row = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(uploadedPath) as { status: string } | undefined;
		expect(row?.status).toBe("pending");
	});

	it("does NOT enqueue when conversion service is disabled for manual convert API", async () => {
		setConversionEnabledForTesting(false);
		const dir = path.join(TEST_ROOT, "manual-disabled");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "manual.pdf");
		await fs.writeFile(pdfPath, "%PDF-1.4 fake");

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		const res = await api
			.post("/api/workspace/files/convert")
			.send({ path: pdfPath });

		expect(res.status).toBe(503);
		expect(res.body.error).toContain("Python conversion service not configured");

		// Status must remain unchanged
		const row = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string } | undefined;
		expect(row?.status).toBe("pending");
	});

	it("does NOT enqueue when conversion service is disabled for retry API", async () => {
		setConversionEnabledForTesting(false);
		const dir = path.join(TEST_ROOT, "retry-disabled");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "retry.pdf");
		await fs.writeFile(pdfPath, "%PDF-1.4 fake");

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, error, updated_at)
			 VALUES (?, ?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "convert_failed", "Old error", Date.now());

		const res = await api
			.post("/api/workspace/files/retry")
			.send({ path: pdfPath });

		expect(res.status).toBe(503);
		expect(res.body.error).toContain("Python conversion service not configured");

		// Status and error must remain unchanged
		const row = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(row?.status).toBe("convert_failed");
		expect(row?.error).toBe("Old error");
	});

	it("indexes uploaded images directly for RAG even when conversion service is disabled", async () => {
		setConversionEnabledForTesting(false);
		const tmpDir = path.join(TEST_ROOT, "image-rag");
		await fs.mkdir(tmpDir, { recursive: true });
		const fileName = `diagram-${Date.now()}.png`;

		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", tmpDir)
			.attach("files", Buffer.from([0x89, 0x50, 0x4e, 0x47]), fileName);

		expect(res.status).toBe(201);
		const uploadedPath = res.body.entries[0].path;
		const db = await getRidgeDb();
		const chunk = db
			.prepare("SELECT file_type, source_path FROM search_chunks WHERE target_path = ?")
			.get(uploadedPath) as { file_type: string; source_path: string } | undefined;
		expect(chunk).toMatchObject({
			file_type: "image",
		});

		const results = await searchContent(fileName, { workspaceDir: TEST_ROOT });
		expect(results.some((item) => item.targetPath === uploadedPath && item.fileType === "image")).toBe(true);
	});
});
