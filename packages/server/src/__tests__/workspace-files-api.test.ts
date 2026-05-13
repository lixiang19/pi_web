import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "workspace-files-test");

beforeAll(async () => {
	api = await createAuthenticatedAgent(app);
	// Ensure test workspace tree with the eight preset directories
	const presetDirs = ["项目", "笔记", "日记", "剪藏", "附件", "记忆", "Wiki", "空间"];
	for (const dir of presetDirs) {
		await fs.mkdir(path.join(TEST_ROOT, dir), { recursive: true });
	}
	await fs.mkdir(path.join(TEST_ROOT, "附件", "docs"), { recursive: true });
	await fs.writeFile(path.join(TEST_ROOT, "附件", "paper.pdf"), "%PDF-1.4");
	await fs.writeFile(path.join(TEST_ROOT, "附件", "docs", "notes.md"), "# notes");
	await fs.mkdir(path.join(TEST_ROOT, ".ridge", "tmp"), { recursive: true });
	await fs.writeFile(path.join(TEST_ROOT, ".ridge", "tmp", "secret.txt"), "secret");
	await fs.writeFile(path.join(TEST_ROOT, "readme.md"), "# readme");

	// Seed processing status using the default workspace dir as workspace_path
	const db = await getRidgeDb();
	db.prepare(
		`INSERT OR REPLACE INTO file_processing_status (
			file_path, workspace_path, status, content_hash, updated_at
		) VALUES (?, ?, ?, ?, ?)`,
	).run(
		path.join(TEST_ROOT, "附件", "paper.pdf"),
		WORKSPACE,
		"converted",
		"abc123",
		Date.now(),
	);
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ?").run(`${TEST_ROOT}%`);
});

describe("GET /api/workspace/files/tree", () => {
	it("returns entries with processingStatus for files", async () => {
		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(path.join(TEST_ROOT, "附件"))}`,
		);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.entries)).toBe(true);

		const paper = res.body.entries.find((e: Record<string, unknown>) => e.name === "paper.pdf");
		expect(paper).toBeDefined();
		expect(paper.processingStatus).toBe("converted");

		const docs = res.body.entries.find((e: Record<string, unknown>) => e.name === "docs");
		expect(docs).toBeDefined();
		expect(docs.processingStatus).toBeUndefined();
	});

	it("hides .ridge from tree", async () => {
		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(TEST_ROOT)}`,
		);
		expect(res.status).toBe(200);
		expect(
			res.body.entries.some((e: Record<string, unknown>) => e.name === ".ridge"),
		).toBe(false);
	});

	it("also hides .git and node_modules", async () => {
		await fs.mkdir(path.join(TEST_ROOT, ".git"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "node_modules"), { recursive: true });
		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(TEST_ROOT)}`,
		);
		expect(res.status).toBe(200);
		expect(
			res.body.entries.some((e: Record<string, unknown>) => e.name === ".git"),
		).toBe(false);
		expect(
			res.body.entries.some((e: Record<string, unknown>) => e.name === "node_modules"),
		).toBe(false);
	});

	it("includes the eight preset directories at workspace root", async () => {
		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(TEST_ROOT)}`,
		);
		expect(res.status).toBe(200);
		const names = res.body.entries.map((e: Record<string, unknown>) => e.name);
		for (const dir of ["项目", "笔记", "日记", "剪藏", "附件", "记忆", "Wiki", "空间"]) {
			expect(names).toContain(dir);
		}
	});

	it("returns 400 when path is not a directory", async () => {
		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(path.join(TEST_ROOT, "readme.md"))}`,
		);
		expect(res.status).toBe(400);
	});

	it("ignores client-supplied root and always uses default workspace", async () => {
		// Even if client passes a different root, the API should still use the server workspace
		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(TEST_ROOT)}&root=/tmp`,
		);
		expect(res.status).toBe(200);
		// Should contain workspace entries, not /tmp entries
		expect(
			res.body.entries.some((e: Record<string, unknown>) => e.name === ".ridge"),
		).toBe(false);
	});

	it("rejects external project root", async () => {
		const externalDir = path.join(os.tmpdir(), "ridge-external-root-test");
		await fs.mkdir(externalDir, { recursive: true });
		await fs.writeFile(path.join(externalDir, "secret.txt"), "secret");
		try {
			// Client tries to pass an external directory as path
			const res = await api.get(
				`/api/workspace/files/tree?path=${encodeURIComponent(externalDir)}`,
			);
			expect(res.status).toBe(400);
		} finally {
			await fs.rm(externalDir, { recursive: true, force: true });
		}
	});

	it("rejects .ridge exposed via symlink in tree", async () => {
		const visibleDir = path.join(TEST_ROOT, "visible");
		await fs.mkdir(visibleDir, { recursive: true });
		const symlinkToRidge = path.join(visibleDir, "ridge-link");
		try {
			await fs.symlink(path.join(TEST_ROOT, ".ridge"), symlinkToRidge);
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "EEXIST") {
				// skip
			} else {
				throw e;
			}
		}
		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(visibleDir)}`,
		);
		// Must not return the symlink entry pointing to .ridge
		expect(
			res.body.entries.some((e: Record<string, unknown>) => e.name === "ridge-link"),
		).toBe(false);
		expect(res.status).toBe(200);
	});
});

describe("GET /api/workspace/files/read", () => {
	it("returns file preview for attachment files", async () => {
		const res = await api.get(
			`/api/workspace/files/read?path=${encodeURIComponent(path.join(TEST_ROOT, "附件", "docs", "notes.md"))}`,
		);
		expect(res.status).toBe(200);
		expect(res.body.previewKind).toBe("markdown");
		expect(res.body.content).toBe("# notes");
	});

	it("rejects reading files inside .ridge", async () => {
		const res = await api.get(
			`/api/workspace/files/read?path=${encodeURIComponent(path.join(TEST_ROOT, ".ridge", "tmp", "secret.txt"))}`,
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when path is a directory", async () => {
		const res = await api.get(
			`/api/workspace/files/read?path=${encodeURIComponent(path.join(TEST_ROOT, "附件"))}`,
		);
		expect(res.status).toBe(400);
	});

	it("rejects external file read", async () => {
		const externalFile = path.join(os.tmpdir(), "ridge-external-file-test.txt");
		await fs.writeFile(externalFile, "secret");
		try {
			const res = await api.get(
				`/api/workspace/files/read?path=${encodeURIComponent(externalFile)}`,
			);
			expect(res.status).toBe(400);
		} finally {
			await fs.unlink(externalFile);
		}
	});

	it("rejects reading .ridge file exposed via symlink", async () => {
		const visibleDir = path.join(TEST_ROOT, "visible-read");
		await fs.mkdir(visibleDir, { recursive: true });
		const symlinkFile = path.join(visibleDir, "secret-link.txt");
		try {
			await fs.symlink(path.join(TEST_ROOT, ".ridge", "tmp", "secret.txt"), symlinkFile);
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "EEXIST") {
				// skip
			} else {
				throw e;
			}
		}
		const res = await api.get(
			`/api/workspace/files/read?path=${encodeURIComponent(symlinkFile)}`,
		);
		expect(res.status).toBe(400);
	});
});
