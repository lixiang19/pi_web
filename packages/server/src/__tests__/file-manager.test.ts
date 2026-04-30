import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createTempFileManager } from "../test/helpers.js";

const createUploadFile = (
	name: string,
	content: string,
): Express.Multer.File => ({
	buffer: Buffer.from(content),
	originalname: name,
	fieldname: "files",
	encoding: "7bit",
	mimetype: "text/plain",
	size: Buffer.byteLength(content),
	stream: null as never,
	destination: "",
	filename: name,
	path: "",
});

describe("file-manager", () => {
	let cleanup: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (cleanup) {
			await cleanup();
			cleanup = undefined;
		}
	});

	it("createEntry creates files and rejects duplicate targets", async () => {
		const { manager, root, cleanup: c } = await createTempFileManager();
		cleanup = c;
		const entry = await manager.createEntry({
			root,
			directory: root,
			name: "README.md",
			kind: "file",
		});

		expect(entry.name).toBe("README.md");
		expect(entry.size).toBe(0);
		expect(entry.extension).toBe(".md");

		await expect(() =>
			manager.createEntry({
				root,
				directory: root,
				name: "README.md",
				kind: "file",
			}),
		).rejects.toThrow();
	});

	it("moveEntry rejects moving a directory into itself", async () => {
		const { manager, root, cleanup: c } = await createTempFileManager();
		cleanup = c;
		await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });

		await expect(() =>
			manager.moveEntry({
				root,
				path: path.join(root, "src"),
				targetDirectory: path.join(root, "src", "nested"),
			}),
		).rejects.toThrow(/itself/);
	});

	it("uploadFiles rejects duplicate names before writing files", async () => {
		const { manager, root, cleanup: c } = await createTempFileManager();
		cleanup = c;

		await expect(() =>
			manager.uploadFiles({
				root,
				directory: root,
				files: [
					createUploadFile("a.txt", "one"),
					createUploadFile("a.txt", "two"),
				],
			}),
		).rejects.toThrow();

		await expect(fs.stat(path.join(root, "a.txt"))).rejects.toThrow(/ENOENT/);
	});

	it("trashEntry validates root boundary before trashing", async () => {
		const { manager, root, cleanup: c } = await createTempFileManager();
		cleanup = c;
		const outside = await fs.mkdtemp(
			path.join(os.tmpdir(), "ridge-file-outside-"),
		);
		const outsideFile = path.join(outside, "secret.txt");
		await fs.writeFile(outsideFile, "secret", "utf8");

		await expect(() => manager.trashEntry(root, outsideFile)).rejects.toThrow(
			/outside the allowed workspace root/,
		);

		expect(await fs.readFile(outsideFile, "utf8")).toBe("secret");

		await fs.rm(outside, { recursive: true, force: true });
	});
});
