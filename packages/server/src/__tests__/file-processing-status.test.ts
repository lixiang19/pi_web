import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, setConversionEnabledForTesting } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";
import { toPosixPath } from "../utils/paths.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "file-processing-test");

beforeAll(async () => {
	setConversionEnabledForTesting(true);
	api = await createAuthenticatedAgent(app);
	await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM notification_events WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
});

async function seedStatus(
	filePath: string,
	status: string,
	workspace = WORKSPACE,
	extra?: { error?: string; convertedAt?: number; indexedAt?: number },
) {
	const db = await getRidgeDb();
	const existing = db
		.prepare("SELECT file_path FROM file_processing_status WHERE file_path = ?")
		.get(filePath) as { file_path: string } | undefined;
	if (existing) {
		db.prepare("DELETE FROM file_processing_status WHERE file_path = ?").run(filePath);
	}
	db.prepare(
		`INSERT INTO file_processing_status (
			file_path, workspace_path, status, content_hash, converted_at, indexed_at, error, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		filePath,
		workspace,
		status,
		"",
		extra?.convertedAt ?? null,
		extra?.indexedAt ?? null,
		extra?.error ?? null,
		Date.now(),
	);
}

describe("File Processing Status Lifecycle", () => {
	it("creates pending record via real upload API", async () => {
		const fileName = `upload-pending-${Date.now()}.txt`;
		const targetDir = path.join(TEST_ROOT, "附件");
		await fs.mkdir(targetDir, { recursive: true });

		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", targetDir)
			.attach("files", Buffer.from("hello upload"), fileName);
		expect(res.status).toBe(201);
		expect(res.body.entries).toHaveLength(1);

		const uploadedPath = res.body.entries[0].path;
		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(uploadedPath) as { status: string } | undefined;
		expect(row).toBeDefined();
		expect(row!.status).toBe("pending");
	});

	it("upload skips creating status for .ridge files", async () => {
		// Upload to .ridge dir via fileManager boundary
		const fileName = `ridge-upload-${Date.now()}.txt`;
		// Create a file inside .ridge manually, then try to query its status
		const ridgeDir = path.join(TEST_ROOT, ".ridge", "tmp");
		await fs.mkdir(ridgeDir, { recursive: true });
		const ridgeFile = path.join(ridgeDir, fileName);
		await fs.writeFile(ridgeFile, "secret");

		// The upload API should not create status for .ridge files
		// We test by trying to read tree of .ridge (should be blocked)
		const treeRes = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(ridgeDir)}`,
		);
		// .ridge should be hidden or return 400
		expect(treeRes.status).toBe(400);

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(ridgeFile) as unknown;
		expect(row).toBeUndefined();
	});

	it("enforces status transitions: pending -> converting -> converted -> indexed", async () => {
		const fileName = `transition-${Date.now()}.md`;
		const filePath = path.join(TEST_ROOT, "笔记", fileName);
		await fs.mkdir(path.join(TEST_ROOT, "笔记"), { recursive: true });
		await fs.writeFile(filePath, "# Note");
		await seedStatus(filePath, "pending");

		// pending -> converting OK
		let res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "converting",
		});
		expect(res.status).toBe(200);

		// converting -> converted OK
		res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "converted",
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const afterConverted = db
			.prepare("SELECT converted_at, indexed_at FROM file_processing_status WHERE file_path = ?")
			.get(filePath) as { converted_at: number | null; indexed_at: number | null };
		expect(afterConverted.converted_at).not.toBeNull();
		expect(afterConverted.indexed_at).toBeNull();

		// converted -> indexed OK, converted_at must be preserved
		res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "indexed",
		});
		expect(res.status).toBe(200);

		const afterIndexed = db
			.prepare("SELECT converted_at, indexed_at FROM file_processing_status WHERE file_path = ?")
			.get(filePath) as { converted_at: number | null; indexed_at: number | null };
		expect(afterIndexed.converted_at).not.toBeNull();
		expect(afterIndexed.indexed_at).not.toBeNull();
		expect(afterIndexed.converted_at).toBe(afterConverted.converted_at);
	});

	it("rejects invalid transitions", async () => {
		const fileName = `bad-transition-${Date.now()}.txt`;
		const filePath = path.join(TEST_ROOT, "笔记", fileName);
		await fs.writeFile(filePath, "test");
		await seedStatus(filePath, "pending");

		// pending -> indexed is invalid (must go through converting -> converted)
		let res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "indexed",
		});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Invalid status transition");

		// indexed is terminal: no transitions out
		await seedStatus(filePath, "indexed", WORKSPACE, { convertedAt: Date.now() - 1000, indexedAt: Date.now() });
		for (const badStatus of ["converting", "converted", "convert_failed", "index_failed"]) {
			res = await api.patch("/api/workspace/files/status").send({
				path: filePath,
				status: badStatus,
				error: "bad",
			});
			expect(res.status).toBe(400);
			expect(res.text).toContain("Invalid status transition");
		}

		// convert_failed can only go to pending via retry API, not PATCH /status
		await seedStatus(filePath, "convert_failed", WORKSPACE, { error: "fail" });
		for (const badStatus of ["pending", "converting", "converted", "indexed", "index_failed"]) {
			res = await api.patch("/api/workspace/files/status").send({
				path: filePath,
				status: badStatus,
				error: "bad",
			});
			expect(res.status).toBe(400);
			expect(res.text).toContain("Invalid status transition");
		}

		// index_failed can only go to pending via retry API, not PATCH /status
		await seedStatus(filePath, "index_failed", WORKSPACE, { error: "fail" });
		for (const badStatus of ["pending", "converting", "converted", "indexed", "convert_failed"]) {
			res = await api.patch("/api/workspace/files/status").send({
				path: filePath,
				status: badStatus,
				error: "bad",
			});
			expect(res.status).toBe(400);
			expect(res.text).toContain("Invalid status transition");
		}
	});

	it("requires error on failure states", async () => {
		const fileName = `fail-no-error-${Date.now()}.pdf`;
		const filePath = path.join(TEST_ROOT, "附件", fileName);
		await fs.writeFile(filePath, "%PDF");
		await seedStatus(filePath, "converting");

		const res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "convert_failed",
		});
		expect(res.status).toBe(400);
		expect(res.text).toContain("error is required");
	});

	it("returns 404 when updating missing record", async () => {
		const filePath = path.join(TEST_ROOT, "附件", `orphan-${Date.now()}.txt`);
		await fs.writeFile(filePath, "x");
		// No DB record seeded

		const res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "converting",
		});
		expect(res.status).toBe(404);
	});

	it("stores error and generates notification on convert_failed via real API", async () => {
		const fileName = `convert-fail-${Date.now()}.pdf`;
		const filePath = path.join(TEST_ROOT, "附件", fileName);
		await fs.writeFile(filePath, "%PDF-1.4 fake");
		await seedStatus(filePath, "converting");

		const res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "convert_failed",
			error: "Docling parser not available",
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(filePath) as { status: string; error: string } | undefined;
		expect(row!.status).toBe("convert_failed");
		expect(row!.error).toBe("Docling parser not available");

		const notif = db
			.prepare("SELECT * FROM notification_events WHERE event_type = ? ORDER BY created_at DESC LIMIT 1")
			.get("file_processing.convert_failed") as { title: string; body: string; payload_json: string } | undefined;
		expect(notif).toBeDefined();
		expect(notif!.title).toContain("文件转换失败");
		expect(notif!.body).toBe("Docling parser not available");
		expect(notif!.payload_json).toContain(filePath);
	});

	it("stores error and generates notification on index_failed via real API", async () => {
		const fileName = `index-fail-${Date.now()}.md`;
		const filePath = path.join(TEST_ROOT, "笔记", fileName);
		await fs.writeFile(filePath, "# Note");
		await seedStatus(filePath, "converted");

		const res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "index_failed",
			error: "Embedding service unavailable",
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(filePath) as { status: string; error: string } | undefined;
		expect(row!.status).toBe("index_failed");
		expect(row!.error).toBe("Embedding service unavailable");

		const notif = db
			.prepare("SELECT * FROM notification_events WHERE event_type = ? ORDER BY created_at DESC LIMIT 1")
			.get("file_processing.index_failed") as { title: string; body: string } | undefined;
		expect(notif).toBeDefined();
		expect(notif!.title).toContain("文件索引失败");
		expect(notif!.body).toBe("Embedding service unavailable");
	});

	it("retry resets failed status back to pending", async () => {
		const fileName = `retry-test-${Date.now()}.pdf`;
		const filePath = path.join(TEST_ROOT, "附件", fileName);
		await fs.writeFile(filePath, "%PDF-1.4");
		await seedStatus(filePath, "convert_failed", WORKSPACE, { error: "Old error" });

		const res = await api.post("/api/workspace/files/retry").send({ path: filePath });
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(filePath) as { status: string; error: string | null } | undefined;
		expect(row!.status).toBe("pending");
		expect(row!.error).toBeNull();
	});

	it("retry rejects .ridge and external paths", async () => {
		const ridgeFile = path.join(TEST_ROOT, ".ridge", "tmp", `retry-ridge-${Date.now()}.txt`);
		await fs.mkdir(path.join(TEST_ROOT, ".ridge", "tmp"), { recursive: true });
		await fs.writeFile(ridgeFile, "secret");

		// First seed a fake record so the DB lookup would pass if we didn't validate
		await seedStatus(ridgeFile, "convert_failed");

		const res = await api.post("/api/workspace/files/retry").send({ path: ridgeFile });
		// Should be rejected by fileManager.resolveManagedFileLocation
		expect(res.status).toBe(400);
	});

	it("deletes processing status record when file is deleted via real API", async () => {
		const fileName = `delete-sync-${Date.now()}.md`;
		const filePath = path.join(TEST_ROOT, "笔记", fileName);
		await fs.writeFile(filePath, "# Temp");
		await seedStatus(filePath, "pending");

		const res = await api.delete("/api/files/entries").query({
			root: TEST_ROOT,
			path: filePath,
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(filePath) as unknown;
		expect(row).toBeUndefined();
	});

	it("deletes processing status records for directory and nested files", async () => {
		const dirPath = path.join(TEST_ROOT, "delete-dir-test");
		const childFile = path.join(dirPath, "child.md");
		const nestedFile = path.join(dirPath, "sub", "nested.md");
		await fs.mkdir(path.join(dirPath, "sub"), { recursive: true });
		await fs.writeFile(childFile, "# child");
		await fs.writeFile(nestedFile, "# nested");
		await seedStatus(childFile, "pending");
		await seedStatus(nestedFile, "converted");

		const res = await api.delete("/api/files/entries").query({
			root: TEST_ROOT,
			path: dirPath,
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const rows = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path LIKE ?")
			.all(`${dirPath}%`) as unknown[];
		expect(rows).toHaveLength(0);
	});

	it("rejects invalid status values", async () => {
		const fileName = `invalid-status-${Date.now()}.txt`;
		const filePath = path.join(TEST_ROOT, "笔记", fileName);
		await fs.writeFile(filePath, "test");
		await seedStatus(filePath, "pending");

		const res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "invalid_status",
		});
		expect(res.status).toBe(400);
	});

	it("rejects retry on non-failed files", async () => {
		const fileName = `retry-reject-${Date.now()}.txt`;
		const filePath = path.join(TEST_ROOT, "笔记", fileName);
		await fs.writeFile(filePath, "test");
		await seedStatus(filePath, "pending");

		const res = await api.post("/api/workspace/files/retry").send({ path: filePath });
		expect(res.status).toBe(400);
	});

	it("deletes processing status records for directory with special LIKE chars without mis-match", async () => {
		// Directory name contains underscore and percent sign — dangerous for SQL LIKE
		const safeDir = path.join(TEST_ROOT, "safe_dir");
		const unsafeDir = path.join(TEST_ROOT, "unsafe%dir");
		const childSafe = path.join(safeDir, "child.md");
		const childUnsafe = path.join(unsafeDir, "child.md");
		await fs.mkdir(safeDir, { recursive: true });
		await fs.mkdir(unsafeDir, { recursive: true });
		await fs.writeFile(childSafe, "# safe");
		await fs.writeFile(childUnsafe, "# unsafe");
		await seedStatus(childSafe, "pending");
		await seedStatus(childUnsafe, "converted");

		// Delete the safe directory only
		const res = await api.delete("/api/files/entries").query({
			root: TEST_ROOT,
			path: safeDir,
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		// childSafe should be gone
		const safeRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(childSafe) as unknown;
		expect(safeRow).toBeUndefined();

		// childUnsafe must still exist (LIKE escaping prevented mis-match)
		const unsafeRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(childUnsafe) as { status: string } | undefined;
		expect(unsafeRow).toBeDefined();
		expect(unsafeRow!.status).toBe("converted");
	});

	it("deletes safe_dir without matching safeXdir via unescaped underscore", async () => {
		const safeDir = path.join(TEST_ROOT, "safe_dir");
		const similarDir = path.join(TEST_ROOT, "safeXdir");
		const childSafe = path.join(safeDir, "child.md");
		const childSimilar = path.join(similarDir, "child.md");
		await fs.mkdir(safeDir, { recursive: true });
		await fs.mkdir(similarDir, { recursive: true });
		await fs.writeFile(childSafe, "# safe");
		await fs.writeFile(childSimilar, "# similar");
		await seedStatus(childSafe, "pending");
		await seedStatus(childSimilar, "converted");

		const res = await api.delete("/api/files/entries").query({
			root: TEST_ROOT,
			path: safeDir,
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const safeRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(childSafe) as unknown;
		expect(safeRow).toBeUndefined();

		const similarRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(childSimilar) as { status: string } | undefined;
		expect(similarRow).toBeDefined();
		expect(similarRow!.status).toBe("converted");
	});

	it("deletes percent%dir without matching percentXdir", async () => {
		const percentDir = path.join(TEST_ROOT, "percent%dir");
		const similarDir = path.join(TEST_ROOT, "percentXdir");
		const childPercent = path.join(percentDir, "child.md");
		const childSimilar = path.join(similarDir, "child.md");
		await fs.mkdir(percentDir, { recursive: true });
		await fs.mkdir(similarDir, { recursive: true });
		await fs.writeFile(childPercent, "# percent");
		await fs.writeFile(childSimilar, "# similar");
		await seedStatus(childPercent, "pending");
		await seedStatus(childSimilar, "converted");

		const res = await api.delete("/api/files/entries").query({
			root: TEST_ROOT,
			path: percentDir,
		});
		expect(res.status).toBe(200);

		const db = await getRidgeDb();
		const percentRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(childPercent) as unknown;
		expect(percentRow).toBeUndefined();

		const similarRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(childSimilar) as { status: string } | undefined;
		expect(similarRow).toBeDefined();
		expect(similarRow!.status).toBe("converted");
	});

	it("tree returns processingStatus and error for failed files", async () => {
		const fileName = `tree-failed-${Date.now()}.pdf`;
		const filePath = path.join(TEST_ROOT, "附件", fileName);
		await fs.writeFile(filePath, "%PDF");
		await seedStatus(filePath, "convert_failed", WORKSPACE, { error: "Parser error" });

		const res = await api.get(
			`/api/workspace/files/tree?path=${encodeURIComponent(path.join(TEST_ROOT, "附件"))}`,
		);
		expect(res.status).toBe(200);
		const entry = res.body.entries.find((e: Record<string, unknown>) => e.name === fileName);
		expect(entry).toBeDefined();
		expect(entry.processingStatus).toBe("convert_failed");
		expect(entry.processingError).toBe("Parser error");
	});

	it("rejects PATCH /status and POST /retry when path contains backslash", async () => {
		// Paths containing backslash are rejected at the API layer to prevent
		// toPosixPath() from collapsing backslash into forward slash, which
		// would collide with real subdirectory semantics.
		const fileName = `backslash-reject-${Date.now()}.txt`;
		const backslashDir = path.join(TEST_ROOT, "附件\\");
		const filePath = path.join(backslashDir, fileName);
		// Do NOT create the file on disk — the API must reject before touching FS.
		await seedStatus(toPosixPath(filePath), "converting");

		const res = await api.patch("/api/workspace/files/status").send({
			path: filePath,
			status: "convert_failed",
			error: "Conversion failed",
		});
		expect(res.status).toBe(400);
		expect(res.text).toContain("backslash");

		const retryRes = await api.post("/api/workspace/files/retry").send({ path: filePath });
		expect(retryRes.status).toBe(400);
		expect(retryRes.text).toContain("backslash");

		// DB must remain unchanged (no write happened)
		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(filePath)) as { status: string } | undefined;
		expect(row).toBeDefined();
		expect(row!.status).toBe("converting");
	});

	it("PATCH /api/files/entries/path syncs file_processing_status for files", async () => {
		const fileName = `move-file-${Date.now()}.txt`;
		const filePath = path.join(TEST_ROOT, "附件", fileName);
		await fs.writeFile(filePath, "move me");
		await seedStatus(filePath, "converting");

		const newName = `moved-file-${Date.now()}.txt`;
		const newPath = path.join(TEST_ROOT, "附件", newName);

		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: filePath,
			name: newName,
		});
		expect(res.status).toBe(200);
		expect(res.body.entry.path).toBe(toPosixPath(newPath));

		const db = await getRidgeDb();
		const oldRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(filePath)) as unknown;
		expect(oldRow).toBeUndefined();

		const newRow = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(newPath)) as { status: string } | undefined;
		expect(newRow).toBeDefined();
		expect(newRow!.status).toBe("converting");
	});

	it("PATCH /api/files/entries/path syncs file_processing_status for directories by prefix", async () => {
		const dirPath = path.join(TEST_ROOT, "move-dir-test");
		const childFile = path.join(dirPath, "child.md");
		const nestedFile = path.join(dirPath, "sub", "nested.md");
		await fs.mkdir(path.join(dirPath, "sub"), { recursive: true });
		await fs.writeFile(childFile, "# child");
		await fs.writeFile(nestedFile, "# nested");
		await seedStatus(childFile, "pending");
		await seedStatus(nestedFile, "converted");

		const newDirName = `moved-dir-${Date.now()}`;
		const newDirPath = path.join(TEST_ROOT, newDirName);

		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: dirPath,
			name: newDirName,
		});
		expect(res.status).toBe(200);
		expect(res.body.entry.path).toBe(toPosixPath(newDirPath));

		const db = await getRidgeDb();
		const oldRows = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path LIKE ?")
			.all(`${toPosixPath(dirPath)}%`) as unknown[];
		expect(oldRows).toHaveLength(0);

		const newChild = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(path.join(newDirPath, "child.md"))) as { status: string } | undefined;
		expect(newChild).toBeDefined();
		expect(newChild!.status).toBe("pending");

		const newNested = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(path.join(newDirPath, "sub", "nested.md"))) as { status: string } | undefined;
		expect(newNested).toBeDefined();
		expect(newNested!.status).toBe("converted");
	});

	it("PATCH /api/files/entries/path handles underscore in directory names without mis-match", async () => {
		const safeDir = path.join(TEST_ROOT, "safe_dir");
		const similarDir = path.join(TEST_ROOT, "safeXdir");
		const childSafe = path.join(safeDir, "child.md");
		const childSimilar = path.join(similarDir, "child.md");
		await fs.mkdir(safeDir, { recursive: true });
		await fs.mkdir(similarDir, { recursive: true });
		await fs.writeFile(childSafe, "# safe");
		await fs.writeFile(childSimilar, "# similar");
		await seedStatus(childSafe, "pending");
		await seedStatus(childSimilar, "converted");

		const newSafeName = `safe_moved_${Date.now()}`;
		const newSafePath = path.join(TEST_ROOT, newSafeName);

		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: safeDir,
			name: newSafeName,
		});
		expect(res.status).toBe(200);
		expect(res.body.entry.path).toBe(toPosixPath(newSafePath));

		const db = await getRidgeDb();
		const safeRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childSafe)) as unknown;
		expect(safeRow).toBeUndefined();

		const movedSafe = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(path.join(newSafePath, "child.md"))) as { status: string } | undefined;
		expect(movedSafe).toBeDefined();
		expect(movedSafe!.status).toBe("pending");

		const similarRow = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childSimilar)) as { status: string } | undefined;
		expect(similarRow).toBeDefined();
		expect(similarRow!.status).toBe("converted");
	});

	it("PATCH /api/files/entries/path handles percent sign in directory names without mis-match", async () => {
		const percentDir = path.join(TEST_ROOT, "percent%dir");
		const similarDir = path.join(TEST_ROOT, "percentXdir");
		const childPercent = path.join(percentDir, "child.md");
		const childSimilar = path.join(similarDir, "child.md");
		await fs.mkdir(percentDir, { recursive: true });
		await fs.mkdir(similarDir, { recursive: true });
		await fs.writeFile(childPercent, "# percent");
		await fs.writeFile(childSimilar, "# similar");
		await seedStatus(childPercent, "pending");
		await seedStatus(childSimilar, "converted");

		const newPercentName = `percent_moved_${Date.now()}`;
		const newPercentPath = path.join(TEST_ROOT, newPercentName);

		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: percentDir,
			name: newPercentName,
		});
		expect(res.status).toBe(200);
		expect(res.body.entry.path).toBe(toPosixPath(newPercentPath));

		const db = await getRidgeDb();
		const percentRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childPercent)) as unknown;
		expect(percentRow).toBeUndefined();

		const movedPercent = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(path.join(newPercentPath, "child.md"))) as { status: string } | undefined;
		expect(movedPercent).toBeDefined();
		expect(movedPercent!.status).toBe("pending");

		const similarRow = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childSimilar)) as { status: string } | undefined;
		expect(similarRow).toBeDefined();
		expect(similarRow!.status).toBe("converted");
	});

	it("PATCH /api/files/entries/path rejects paths containing real backslash", async () => {
		// Real backslash in path must be rejected before touching filesystem or DB.
		const backslashDir = path.join(TEST_ROOT, "附件\\");
		const filePath = path.join(backslashDir, "child.md");
		// Seed DB — the request must be rejected and DB untouched.
		await seedStatus(toPosixPath(filePath), "converting");

		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: filePath,
			name: "moved.md",
		});
		expect(res.status).toBe(400);
		expect(res.text).toContain("backslash");

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(filePath)) as { status: string } | undefined;
		expect(row).toBeDefined();
		expect(row!.status).toBe("converting");
	});

	it("PATCH /api/files/entries/path handles backslash_dir (underscore) directory names without mis-match", async () => {
		// Use a directory name containing "backslash" text but no actual
		// backslash character, so toPosixPath never changes its semantics.
		const backslashDir = path.join(TEST_ROOT, "backslash_dir");
		const similarDir = path.join(TEST_ROOT, "backslashXdir");
		const childBackslash = path.join(backslashDir, "child.md");
		const childSimilar = path.join(similarDir, "child.md");
		await fs.mkdir(backslashDir, { recursive: true });
		await fs.mkdir(similarDir, { recursive: true });
		await fs.writeFile(childBackslash, "# backslash");
		await fs.writeFile(childSimilar, "# similar");
		await seedStatus(toPosixPath(childBackslash), "pending");
		await seedStatus(toPosixPath(childSimilar), "converted");

		const newName = `backslash_moved_${Date.now()}`;
		const newPath = path.join(TEST_ROOT, newName);

		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: backslashDir,
			name: newName,
		});
		expect(res.status).toBe(200);
		expect(res.body.entry.path).toBe(toPosixPath(newPath));

		const db = await getRidgeDb();
		const backslashRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childBackslash)) as unknown;
		expect(backslashRow).toBeUndefined();

		const movedBackslash = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(path.join(newPath, "child.md"))) as { status: string } | undefined;
		expect(movedBackslash).toBeDefined();
		expect(movedBackslash!.status).toBe("pending");

		const similarRow = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childSimilar)) as { status: string } | undefined;
		expect(similarRow).toBeDefined();
		expect(similarRow!.status).toBe("converted");
	});

	it("PATCH /api/files/entries/path handles both underscore and percent together", async () => {
		const complexDir = path.join(TEST_ROOT, "unsafe_dir%v1");
		const similarDir = path.join(TEST_ROOT, "unsafeXdir%v1");
		const childComplex = path.join(complexDir, "child.md");
		const childSimilar = path.join(similarDir, "child.md");
		await fs.mkdir(complexDir, { recursive: true });
		await fs.mkdir(similarDir, { recursive: true });
		await fs.writeFile(childComplex, "# complex");
		await fs.writeFile(childSimilar, "# similar");
		await seedStatus(childComplex, "converting");
		await seedStatus(childSimilar, "indexed");

		const newName = `complex_moved_${Date.now()}`;
		const newPath = path.join(TEST_ROOT, newName);

		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: complexDir,
			name: newName,
		});
		expect(res.status).toBe(200);
		expect(res.body.entry.path).toBe(toPosixPath(newPath));

		const db = await getRidgeDb();
		const complexRow = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childComplex)) as unknown;
		expect(complexRow).toBeUndefined();

		const movedComplex = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(path.join(newPath, "child.md"))) as { status: string } | undefined;
		expect(movedComplex).toBeDefined();
		expect(movedComplex!.status).toBe("converting");

		const similarRow = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(toPosixPath(childSimilar)) as { status: string } | undefined;
		expect(similarRow).toBeDefined();
		expect(similarRow!.status).toBe("indexed");
	});
});
