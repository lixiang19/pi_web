import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createIsoGitService, isWorkspaceVersionIgnoredPath } from "../iso-git-service.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	for (const targetPath of cleanupDirs.splice(0)) {
		await fs.rm(targetPath, { recursive: true, force: true });
	}
});

describe("hidden workspace git excludes", () => {
	it("recognizes built-in workspace version ignored paths", () => {
		expect(isWorkspaceVersionIgnoredPath(".DS_Store")).toBe(true);
		expect(isWorkspaceVersionIgnoredPath("空间/.DS_Store")).toBe(true);
		expect(isWorkspaceVersionIgnoredPath("node_modules/pkg/index.js")).toBe(true);
		expect(isWorkspaceVersionIgnoredPath("dist/app.js")).toBe(true);
		expect(isWorkspaceVersionIgnoredPath("note.md")).toBe(false);
	});

	it("excludes ridge system storage from the hidden git index", async () => {
		const workTree = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-iso-git-"));
		cleanupDirs.push(workTree);
		const gitdir = path.join(workTree, ".ridge", "runtime", "git");
		const service = createIsoGitService();

		await service.ensureInit({ workTree, gitdir });

		const exclude = await fs.readFile(path.join(gitdir, "info", "exclude"), "utf-8");
		expect(exclude).toContain(".ridge");
	});

	it("commits modifications and deletions for hidden workspace versions", async () => {
		const workTree = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-iso-git-"));
		cleanupDirs.push(workTree);
		const gitdir = path.join(workTree, ".ridge", "runtime", "git");
		const service = createIsoGitService();

		await fs.writeFile(path.join(workTree, "note.md"), "# one", "utf-8");
		const first = await service.commit({ workTree, gitdir }, "create note", ["note.md"]);
		expect(first.hash).toHaveLength(12);

		await fs.rm(path.join(workTree, "note.md"));
		const second = await service.commit({ workTree, gitdir }, "delete note", ["note.md"]);
		expect(second.hash).toHaveLength(12);

		const status = await service.getStatus({ workTree, gitdir });
		expect(status.files).toEqual([]);
	});

	it("keeps built-in ignored files out of status, diff, and commits", async () => {
		const workTree = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-iso-git-"));
		cleanupDirs.push(workTree);
		const gitdir = path.join(workTree, ".ridge", "runtime", "git");
		const service = createIsoGitService();

		await fs.mkdir(path.join(workTree, "node_modules", "pkg"), { recursive: true });
		await fs.mkdir(path.join(workTree, "空间"), { recursive: true });
		await fs.writeFile(path.join(workTree, ".DS_Store"), "mac metadata", "utf-8");
		await fs.writeFile(path.join(workTree, "空间", ".DS_Store"), "nested metadata", "utf-8");
		await fs.writeFile(path.join(workTree, "node_modules", "pkg", "index.js"), "cache", "utf-8");
		await fs.writeFile(path.join(workTree, "note.md"), "# one", "utf-8");

		const status = await service.getStatus({ workTree, gitdir });
		expect(status.files).toEqual([{ path: "note.md", index: "?", working_dir: "?" }]);

		const first = await service.commit(
			{ workTree, gitdir },
			"create note",
			[".DS_Store", "空间/.DS_Store", "node_modules/pkg/index.js", "note.md"],
		);
		expect(first.hash).toHaveLength(12);

		await fs.writeFile(path.join(workTree, ".DS_Store"), "changed metadata", "utf-8");
		await fs.writeFile(path.join(workTree, "note.md"), "# two\nchanged", "utf-8");

		const diff = await service.getFileDiff({ workTree, gitdir }, ".DS_Store");
		expect(diff).toBe("");

		const nextStatus = await service.getStatus({ workTree, gitdir });
		expect(nextStatus.files).toEqual([{ path: "note.md", index: " ", working_dir: "M" }]);
	});
});
