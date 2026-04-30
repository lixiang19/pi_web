import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";

const api = request(app);

// defaultWorkspaceDir 由 vitest.config.ts 中的 PI_WORKSPACE_DIR 环境变量控制
const WORKSPACE = process.env.PI_WORKSPACE_DIR!;

// 在 workspace 内创建测试目录
const TEST_ROOT = path.join(WORKSPACE, "file-tree-test");

beforeAll(async () => {
	await fs.mkdir(path.join(TEST_ROOT, "子文件夹A"), { recursive: true });
	await fs.mkdir(path.join(TEST_ROOT, "子文件夹B"), { recursive: true });
	await fs.writeFile(path.join(TEST_ROOT, "readme.md"), "# readme");
	await fs.writeFile(path.join(TEST_ROOT, "config.json"), "{}");
	await fs.writeFile(path.join(TEST_ROOT, "子文件夹A", "note.md"), "# note");
	await fs.writeFile(path.join(TEST_ROOT, "子文件夹A", "script.ts"), "// ts");
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
});

describe("GET /api/files/tree", () => {
	it("returns entries for root directory", async () => {
		const res = await api.get(
			`/api/files/tree?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(TEST_ROOT)}`,
		);
		expect(res.status).toBe(200);
		expect(res.body.root).toBeDefined();
		expect(res.body.directory).toBeDefined();
		expect(Array.isArray(res.body.entries)).toBe(true);
		expect(res.body.entries.length).toBeGreaterThanOrEqual(4);
	});

	it("returns directories before files", async () => {
		const res = await api.get(
			`/api/files/tree?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(TEST_ROOT)}`,
		);
		expect(res.status).toBe(200);
		const dirs = res.body.entries.filter((e: any) => e.kind === "directory");
		const files = res.body.entries.filter((e: any) => e.kind === "file");
		if (dirs.length > 0 && files.length > 0) {
			expect(
				dirs[dirs.length - 1].name.localeCompare(files[0].name),
			).toBeLessThanOrEqual(0);
		}
	});

	it("returns 400 when path is not a directory", async () => {
		const res = await api.get(
			`/api/files/tree?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(path.join(TEST_ROOT, "readme.md"))}`,
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when root is empty", async () => {
		const res = await api.get("/api/files/tree");
		expect(res.status).toBe(400);
	});

	it("returns subdirectory entries", async () => {
		const res = await api.get(
			`/api/files/tree?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(path.join(TEST_ROOT, "子文件夹A"))}`,
		);
		expect(res.status).toBe(200);
		expect(res.body.entries.length).toBe(2);
	});

	it("filters .git and node_modules", async () => {
		await fs.mkdir(path.join(TEST_ROOT, ".git"), { recursive: true });
		const res = await api.get(
			`/api/files/tree?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(TEST_ROOT)}`,
		);
		expect(res.status).toBe(200);
		expect(
			res.body.entries.find((e: any) => e.name === ".git"),
		).toBeUndefined();
		await fs.rmdir(path.join(TEST_ROOT, ".git"));
	});

	it("each entry has required fields", async () => {
		const res = await api.get(
			`/api/files/tree?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(TEST_ROOT)}`,
		);
		expect(res.status).toBe(200);
		const entry = res.body.entries[0];
		expect(entry).toHaveProperty("name");
		expect(entry).toHaveProperty("path");
		expect(entry).toHaveProperty("kind");
		expect(entry).toHaveProperty("relativePath");
		expect(entry).toHaveProperty("size");
		expect(entry).toHaveProperty("modifiedAt");
		expect(entry).toHaveProperty("extension");
	});
});

describe("GET /api/files/search", () => {
	it("returns matching files", async () => {
		const res = await api.get(
			`/api/files/search?root=${encodeURIComponent(TEST_ROOT)}&q=md`,
		);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.entries)).toBe(true);
		expect(res.body.entries.length).toBeGreaterThan(0);
		res.body.entries.forEach((e: any) => {
			expect(e.name.toLowerCase()).toContain("md");
		});
	});

	it("respects limit parameter", async () => {
		const res = await api.get(
			`/api/files/search?root=${encodeURIComponent(TEST_ROOT)}&q=md&limit=1`,
		);
		expect(res.status).toBe(200);
		expect(res.body.entries.length).toBeLessThanOrEqual(1);
	});

	it("returns 400 when q is empty", async () => {
		const res = await api.get(
			`/api/files/search?root=${encodeURIComponent(TEST_ROOT)}&q=`,
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when q exceeds 200 chars", async () => {
		const res = await api.get(
			`/api/files/search?root=${encodeURIComponent(TEST_ROOT)}&q=${"x".repeat(201)}`,
		);
		expect(res.status).toBe(400);
	});
});

describe("POST /api/files/entries", () => {
	it("creates a file", async () => {
		const res = await api.post("/api/files/entries").send({
			root: TEST_ROOT,
			directory: TEST_ROOT,
			name: "new-test-file.txt",
			kind: "file",
		});
		expect(res.status).toBe(201);
		expect(res.body.entry.name).toBe("new-test-file.txt");
		expect(res.body.entry.kind).toBe("file");
	});

	it("creates a directory", async () => {
		const res = await api.post("/api/files/entries").send({
			root: TEST_ROOT,
			directory: TEST_ROOT,
			name: "new-test-dir",
			kind: "directory",
		});
		expect(res.status).toBe(201);
		expect(res.body.entry.kind).toBe("directory");
	});

	it("returns 409 on duplicate", async () => {
		await api.post("/api/files/entries").send({
			root: TEST_ROOT,
			directory: TEST_ROOT,
			name: "dup-file.md",
			kind: "file",
		});
		const res = await api.post("/api/files/entries").send({
			root: TEST_ROOT,
			directory: TEST_ROOT,
			name: "dup-file.md",
			kind: "file",
		});
		expect(res.status).toBe(409);
	});
});

describe("PATCH /api/files/entries/path", () => {
	it("renames a file", async () => {
		await api.post("/api/files/entries").send({
			root: TEST_ROOT,
			directory: TEST_ROOT,
			name: "rename-test.md",
			kind: "file",
		});
		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: path.join(TEST_ROOT, "rename-test.md"),
			name: "renamed.md",
		});
		expect(res.status).toBe(200);
		expect(res.body.entry.name).toBe("renamed.md");
	});

	it("returns 400 when name contains separator", async () => {
		const res = await api.patch("/api/files/entries/path").send({
			root: TEST_ROOT,
			path: path.join(TEST_ROOT, "renamed.md"),
			name: "bad/name.md",
		});
		expect(res.status).toBe(400);
	});
});

describe("DELETE /api/files/entries", () => {
	it("trashes a file", async () => {
		await api.post("/api/files/entries").send({
			root: TEST_ROOT,
			directory: TEST_ROOT,
			name: "trash-test.md",
			kind: "file",
		});
		const res = await api.delete(
			`/api/files/entries?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(path.join(TEST_ROOT, "trash-test.md"))}`,
		);
		expect(res.status).toBe(200);
		expect(res.body.trashedAt).toBeDefined();
	});
});

describe("POST /api/notes", () => {
	const noteDir = path.join(WORKSPACE, "notes");

	afterEach(async () => {
		try {
			await fs.unlink(path.join(noteDir, "test-note.md"));
		} catch {}
		try {
			await fs.rmdir(noteDir);
		} catch {}
	});

	it("creates a note with path", async () => {
		const res = await api
			.post("/api/notes")
			.send({ path: "notes/test-note.md" });
		expect(res.status).toBe(201);
		expect(res.body.name).toBe("test-note.md");
		expect(res.body.path).toContain("notes/test-note.md");
	});

	it("returns 409 on duplicate note", async () => {
		await api.post("/api/notes").send({ path: "notes/test-note.md" });
		const res = await api
			.post("/api/notes")
			.send({ path: "notes/test-note.md" });
		expect(res.status).toBe(409);
	});

	it("auto-appends .md extension", async () => {
		const res = await api.post("/api/notes").send({ path: "notes/no-ext" });
		expect(res.status).toBe(201);
		expect(res.body.name).toContain(".md");
		try {
			await fs.unlink(res.body.path);
		} catch {}
	});
});

describe("POST /api/notes/folder", () => {
	afterEach(async () => {
		try {
			await fs.rm(path.join(WORKSPACE, "test-folder"), {
				recursive: true,
				force: true,
			});
		} catch {}
	});

	it("creates a folder", async () => {
		const res = await api
			.post("/api/notes/folder")
			.send({ path: "test-folder" });
		expect(res.status).toBe(201);
		expect(res.body.name).toBe("test-folder");
	});

	it("returns 400 when path has extension", async () => {
		const res = await api.post("/api/notes/folder").send({ path: "bad.txt" });
		expect(res.status).toBe(400);
	});
});

describe("POST /api/files/create", () => {
	afterEach(async () => {
		try {
			await fs.unlink(path.join(WORKSPACE, "canvas", "test.canvas"));
		} catch {}
		try {
			await fs.rmdir(path.join(WORKSPACE, "canvas"));
		} catch {}
	});

	it("creates a file with content", async () => {
		const res = await api
			.post("/api/files/create")
			.send({ path: "canvas/test.canvas", content: "{}" });
		expect(res.status).toBe(201);
		expect(res.body.name).toBe("test.canvas");
	});

	it("returns 400 when path is empty", async () => {
		const res = await api
			.post("/api/files/create")
			.send({ path: "", content: "" });
		expect(res.status).toBe(400);
	});
});

describe("GET /api/workspace/recent-files", () => {
	it("returns recent files sorted by modifiedAt", async () => {
		const res = await api.get(
			`/api/workspace/recent-files?root=${encodeURIComponent(TEST_ROOT)}&limit=5`,
		);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.files)).toBe(true);
		if (res.body.files.length > 1) {
			for (let i = 1; i < res.body.files.length; i++) {
				expect(res.body.files[i - 1].modifiedAt).toBeGreaterThanOrEqual(
					res.body.files[i].modifiedAt,
				);
			}
		}
	});
});

describe("GET /api/files/content", () => {
	it("returns file preview", async () => {
		const res = await api.get(
			`/api/files/content?root=${encodeURIComponent(TEST_ROOT)}&path=${encodeURIComponent(path.join(TEST_ROOT, "readme.md"))}`,
		);
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty("previewKind");
	});
});

describe("favorites storage", () => {
	it("adds a favorite", async () => {
		const res = await api.post("/api/storage/favorites").send({
			id: "/root/test.md",
			name: "test.md",
			type: "file",
			data: { path: "/root/test.md" },
		});
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.items)).toBe(true);
	});

	it("lists favorites", async () => {
		const res = await api.get("/api/storage/favorites");
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.items)).toBe(true);
	});

	it("requires id, name, type for adding", async () => {
		const res = await api
			.post("/api/storage/favorites")
			.send({ id: "/root/x.md" });
		expect(res.status).toBe(400);
	});

	it("removes a favorite", async () => {
		const res = await api.delete("/api/storage/favorites/%2Froot%2Ftest.md");
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.items)).toBe(true);
	});
});
