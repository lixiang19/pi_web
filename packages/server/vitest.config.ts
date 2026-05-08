import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const httpTestWorkspace = path.join(os.tmpdir(), "ridge-http-test-workspace");
const httpTestDb = path.join(os.tmpdir(), "ridge-http-test", "ridge.db");
fs.mkdirSync(httpTestWorkspace, { recursive: true });
fs.mkdirSync(path.dirname(httpTestDb), { recursive: true });

export default defineConfig({
	test: {
		globals: true,
		env: {
			PI_WORKSPACE_DIR: httpTestWorkspace,
			RIDGE_DB_PATH: httpTestDb,
		},
	},
});
