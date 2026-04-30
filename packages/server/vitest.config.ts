import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const httpTestWorkspace = path.join(os.tmpdir(), "ridge-http-test-workspace");
fs.mkdirSync(httpTestWorkspace, { recursive: true });

export default defineConfig({
	test: {
		globals: true,
		env: {
			PI_WORKSPACE_DIR: httpTestWorkspace,
		},
	},
});
