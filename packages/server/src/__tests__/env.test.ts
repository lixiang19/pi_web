import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	loadServerEnvFiles,
	parseDotenvContent,
} from "../env.js";

describe("server env loader", () => {
	it("parses dotenv values with comments and quotes", () => {
		expect(parseDotenvContent(`
			# comment
			EXA_API_KEY=exa-key
			EXA_BASE_URL="https://api.exa.ai"
			QUOTED='literal value'
			export RIDGE_ADMIN_PASSWORD=secret # inline comment
		`)).toEqual({
			EXA_API_KEY: "exa-key",
			EXA_BASE_URL: "https://api.exa.ai",
			QUOTED: "literal value",
			RIDGE_ADMIN_PASSWORD: "secret",
		});
	});

	it("loads .env files without overriding shell-provided variables", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-env-"));
		const packageDir = path.join(root, "packages", "server");
		await fs.mkdir(packageDir, { recursive: true });
		await fs.writeFile(path.join(root, ".env"), [
			"EXA_API_KEY=root-key",
			"EXA_BASE_URL=https://root.example.com",
		].join("\n"));
		await fs.writeFile(path.join(root, ".env.local"), [
			"EXA_BASE_URL=https://local.example.com",
			"RIDGE_ADMIN_PASSWORD=from-local",
		].join("\n"));
		const env: NodeJS.ProcessEnv = {
			RIDGE_ADMIN_PASSWORD: "from-shell",
		};

		const result = loadServerEnvFiles({
			cwd: packageDir,
			repoRoot: root,
			env,
		});

		expect(result.loadedFiles.map((file) => path.basename(file))).toEqual([".env", ".env.local"]);
		expect(env.EXA_API_KEY).toBe("root-key");
		expect(env.EXA_BASE_URL).toBe("https://local.example.com");
		expect(env.RIDGE_ADMIN_PASSWORD).toBe("from-shell");
	});
});
