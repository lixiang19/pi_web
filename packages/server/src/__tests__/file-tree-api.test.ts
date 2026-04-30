import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempFileManager } from "../test/helpers.js";

describe("file tree API logic", () => {
	let ctx: Awaited<ReturnType<typeof createTempFileManager>>;

	afterEach(async () => {
		await ctx.cleanup();
	});

	const setupTestDir = async () => {
		ctx = await createTempFileManager();
		const { root } = ctx;
		await fs.mkdir(path.join(root, "子文件夹A"), { recursive: true });
		await fs.mkdir(path.join(root, "子文件夹B"), { recursive: true });
		await fs.writeFile(path.join(root, "readme.md"), "# readme");
		await fs.writeFile(path.join(root, "config.json"), "{}");
		await fs.writeFile(path.join(root, "子文件夹A", "note.md"), "# note");
		await fs.writeFile(path.join(root, "子文件夹A", "script.ts"), "// ts");
	};

	it("lists root directory entries", async () => {
		await setupTestDir();
		const entries = await ctx.manager.listDirectoryEntries(ctx.root, ctx.root);
		expect(entries.length).toBeGreaterThanOrEqual(4);
		const dirs = entries.filter((e) => e.kind === "directory");
		const files = entries.filter((e) => e.kind === "file");
		if (dirs.length > 0 && files.length > 0) {
			expect(
				dirs[dirs.length - 1].name.localeCompare(files[0].name),
			).toBeLessThanOrEqual(0);
		}
	});

	it("entries have correct fields", async () => {
		await setupTestDir();
		const entries = await ctx.manager.listDirectoryEntries(ctx.root, ctx.root);
		const readme = entries.find((e) => e.name === "readme.md");
		expect(readme).toBeDefined();
		expect(readme!.kind).toBe("file");
		expect(readme!.extension).toBe(".md");
		expect(readme!.size).toBeGreaterThan(0);
		expect(readme!.relativePath).toBe("readme.md");
	});

	it("resolves managed file location within root", async () => {
		await setupTestDir();
		const { rootPath, targetPath } =
			await ctx.manager.resolveManagedFileLocation({
				root: ctx.root,
				path: ctx.root,
				fallbackToRoot: true,
			});
		expect(rootPath).toBe(ctx.root);
		expect(targetPath).toBe(ctx.root);
	});

	it("rejects path outside root", async () => {
		await setupTestDir();
		await expect(
			ctx.manager.resolveManagedFileLocation({
				root: ctx.root,
				path: "/etc/passwd",
			}),
		).rejects.toThrow(/outside the allowed/);
	});

	it("ignores .git and node_modules", async () => {
		await setupTestDir();
		await fs.mkdir(path.join(ctx.root, ".git"), { recursive: true });
		await fs.mkdir(path.join(ctx.root, "node_modules"), { recursive: true });
		const entries = await ctx.manager.listDirectoryEntries(ctx.root, ctx.root);
		expect(entries.find((e) => e.name === ".git")).toBeUndefined();
		expect(entries.find((e) => e.name === "node_modules")).toBeUndefined();
	});

	it("fallbackToRoot returns root when path is empty", async () => {
		await setupTestDir();
		const { targetPath } = await ctx.manager.resolveManagedFileLocation({
			root: ctx.root,
			fallbackToRoot: true,
		});
		expect(targetPath).toBe(ctx.root);
	});

	it("resolves subdirectory entries", async () => {
		await setupTestDir();
		const subDir = path.join(ctx.root, "子文件夹A");
		const entries = await ctx.manager.listDirectoryEntries(subDir, ctx.root);
		expect(entries.length).toBe(2);
		expect(entries.some((e) => e.name === "note.md")).toBe(true);
		expect(entries.some((e) => e.name === "script.ts")).toBe(true);
	});
});
