import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createIsoGitService } from "../iso-git-service.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	for (const targetPath of cleanupDirs.splice(0)) {
		await fs.rm(targetPath, { recursive: true, force: true });
	}
});

describe("hidden workspace git excludes", () => {
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
});
