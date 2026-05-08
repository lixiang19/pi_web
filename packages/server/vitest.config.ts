import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const httpTestHome = path.join(os.tmpdir(), "ridge-http-test-home");
const httpTestDb = path.join(os.tmpdir(), "ridge-http-test", "ridge.db");
fs.mkdirSync(httpTestHome, { recursive: true });
fs.mkdirSync(path.dirname(httpTestDb), { recursive: true });

export default defineConfig({
	test: {
		globals: true,
		env: {
			HOME: httpTestHome,
			RIDGE_DB_PATH: httpTestDb,
		},
	},
});
