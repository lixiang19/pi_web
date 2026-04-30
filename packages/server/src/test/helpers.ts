import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFileManager } from "../file-manager.js";

export const createTempDir = async (prefix = "ridge-test-") => {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
};

export const createTempFileManager = async () => {
	const root = await createTempDir("ridge-fm-");
	const manager = createFileManager({
		defaultWorkspaceDir: root,
		ensureManagedProjectScope: async () => undefined,
	});
	return {
		manager,
		root,
		cleanup: () => fs.rm(root, { recursive: true, force: true }),
	};
};
