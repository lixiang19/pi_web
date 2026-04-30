import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempFileManager } from "../test/helpers.js";

describe("file operations", () => {
	let ctx: Awaited<ReturnType<typeof createTempFileManager>>;

	afterEach(async () => {
		await ctx.cleanup();
	});

	const setup = async () => {
		ctx = await createTempFileManager();
		await fs.writeFile(path.join(ctx.root, "existing.md"), "# existing");
	};

	it("creates a file entry", async () => {
		await setup();
		const entry = await ctx.manager.createEntry({
			root: ctx.root,
			directory: ctx.root,
			name: "new-file.txt",
			kind: "file",
		});
		expect(entry.name).toBe("new-file.txt");
		expect(entry.kind).toBe("file");
		expect(entry.size).toBe(0);
	});

	it("creates a directory entry", async () => {
		await setup();
		const entry = await ctx.manager.createEntry({
			root: ctx.root,
			directory: ctx.root,
			name: "new-dir",
			kind: "directory",
		});
		expect(entry.name).toBe("new-dir");
		expect(entry.kind).toBe("directory");
		expect(entry.size).toBeNull();
	});

	it("rejects duplicate file creation", async () => {
		await setup();
		await expect(
			ctx.manager.createEntry({
				root: ctx.root,
				directory: ctx.root,
				name: "existing.md",
				kind: "file",
			}),
		).rejects.toThrow(/already exists/);
	});

	it("renames a file via moveEntry", async () => {
		await setup();
		const entry = await ctx.manager.moveEntry({
			root: ctx.root,
			path: path.join(ctx.root, "existing.md"),
			name: "renamed.md",
		});
		expect(entry.name).toBe("renamed.md");
	});

	it("rejects rename with path separator in name", async () => {
		await setup();
		await expect(
			ctx.manager.moveEntry({
				root: ctx.root,
				path: path.join(ctx.root, "existing.md"),
				name: "bad/name.md",
			}),
		).rejects.toThrow(/path separators/);
	});

	it("moves a file to a different directory", async () => {
		await setup();
		await fs.mkdir(path.join(ctx.root, "target-dir"));
		const entry = await ctx.manager.moveEntry({
			root: ctx.root,
			path: path.join(ctx.root, "existing.md"),
			targetDirectory: path.join(ctx.root, "target-dir"),
		});
		expect(entry.path).toContain("target-dir");
	});

	it("trashes a file (moves to system trash)", async () => {
		await setup();
		const result = await ctx.manager.trashEntry(
			ctx.root,
			path.join(ctx.root, "existing.md"),
		);
		expect(result.trashedAt).toBeTypeOf("number");
	});

	it("rejects trash outside root", async () => {
		await setup();
		await expect(
			ctx.manager.trashEntry(ctx.root, "/etc/passwd"),
		).rejects.toThrow(/outside/);
	});

	it("rejects moving directory into itself", async () => {
		await setup();
		await fs.mkdir(path.join(ctx.root, "src", "nested"), { recursive: true });
		await expect(
			ctx.manager.moveEntry({
				root: ctx.root,
				path: path.join(ctx.root, "src"),
				targetDirectory: path.join(ctx.root, "src", "nested"),
			}),
		).rejects.toThrow(/itself/);
	});
});
