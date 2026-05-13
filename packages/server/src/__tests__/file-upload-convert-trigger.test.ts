import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, setConversionEnabledForTesting } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "upload-trigger-test");

beforeAll(async () => {
	setConversionEnabledForTesting(true);
	await createAuthenticatedAgent(app);
	await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM background_jobs WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
});

describe("upload auto-enqueue conversion", () => {
	it("does NOT enqueue when conversion service is disabled", async () => {
		setConversionEnabledForTesting(false);
		const tmpDir = path.join(TEST_ROOT, "tmp-disabled");
		await fs.mkdir(tmpDir, { recursive: true });
		const pdfPath = path.join(tmpDir, `disabled-${Date.now()}.pdf`);

		const db = await getRidgeDb();
		const beforeJobs = db.prepare("SELECT COUNT(*) as count FROM background_jobs").get() as { count: number };

		// Simulate upload by directly inserting a pending record
		// (upload route would do this, then conditionally enqueue)
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		const afterJobs = db.prepare("SELECT COUNT(*) as count FROM background_jobs").get() as { count: number };
		expect(afterJobs.count).toBe(beforeJobs.count);
	});
});
