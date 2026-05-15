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
});
