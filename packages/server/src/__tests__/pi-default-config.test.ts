import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
	getPiDefaultAgentDir,
	getPiDefaultAuthPath,
	getPiDefaultModelsPath,
} from "../pi-default-config.js";
import {
	getBuiltInPiConfigDir,
	syncBuiltInPiConfigToDefaultAgentDir,
} from "../pi-config-sync.js";

describe("Pi default config", () => {
	it("uses Pi's default ~/.pi/agent config root", () => {
		const agentDir = path.join(os.homedir(), ".pi", "agent");

		expect(getPiDefaultAgentDir()).toBe(agentDir);
		expect(getPiDefaultAuthPath()).toBe(path.join(agentDir, "auth.json"));
		expect(getPiDefaultModelsPath()).toBe(path.join(agentDir, "models.json"));
	});

	it("overlays built-in config without deleting sessions or user resources", async () => {
		const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-pi-defaults-"));
		const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-pi-agent-"));
		const builtInSettings = {
			defaultProvider: "ridge-provider",
			defaultModel: "ridge-model",
			theme: "cursor-dark",
		};

		await fs.mkdir(path.join(sourceDir, "skills", "ridge-skill"), { recursive: true });
		await fs.mkdir(path.join(sourceDir, "prompts", "ridge-prompt"), { recursive: true });
		await fs.writeFile(
			path.join(sourceDir, "settings.json"),
			JSON.stringify(builtInSettings, null, 2),
			"utf-8",
		);
		await fs.writeFile(
			path.join(sourceDir, "skills", "ridge-skill", "SKILL.md"),
			"# Ridge Skill",
			"utf-8",
		);
		await fs.writeFile(
			path.join(sourceDir, "prompts", "ridge-prompt", "prompt.md"),
			"# Ridge Prompt",
			"utf-8",
		);
		await fs.mkdir(path.join(targetDir, "sessions"), { recursive: true });
		await fs.mkdir(path.join(targetDir, "skills", "custom-skill"), { recursive: true });
		await fs.mkdir(path.join(targetDir, "prompts", "custom-prompt"), { recursive: true });
		await fs.writeFile(path.join(targetDir, "settings.json"), "{\"defaultProvider\":\"old\"}", "utf-8");
		await fs.writeFile(path.join(targetDir, "sessions", "keep.jsonl"), "session", "utf-8");
		await fs.writeFile(path.join(targetDir, "skills", "custom-skill", "SKILL.md"), "# Custom Skill", "utf-8");
		await fs.writeFile(path.join(targetDir, "prompts", "custom-prompt", "prompt.md"), "# Custom Prompt", "utf-8");

		const result = await syncBuiltInPiConfigToDefaultAgentDir({
			sourceDir,
			targetAgentDir: targetDir,
		});

		await expect(fs.readFile(path.join(targetDir, "settings.json"), "utf-8")).resolves.toBe(
			JSON.stringify(builtInSettings, null, 2),
		);
		await expect(fs.readFile(path.join(targetDir, "skills", "ridge-skill", "SKILL.md"), "utf-8")).resolves.toBe(
			"# Ridge Skill",
		);
		await expect(fs.readFile(path.join(targetDir, "prompts", "ridge-prompt", "prompt.md"), "utf-8")).resolves.toBe(
			"# Ridge Prompt",
		);
		await expect(fs.readFile(path.join(targetDir, "sessions", "keep.jsonl"), "utf-8")).resolves.toBe(
			"session",
		);
		await expect(fs.readFile(path.join(targetDir, "skills", "custom-skill", "SKILL.md"), "utf-8")).resolves.toBe(
			"# Custom Skill",
		);
		await expect(fs.readFile(path.join(targetDir, "prompts", "custom-prompt", "prompt.md"), "utf-8")).resolves.toBe(
			"# Custom Prompt",
		);
		expect(result.written).toEqual(["prompts", "settings.json", "skills"]);
	});

	it("keeps the hand-editable built-in Pi settings in the repo", async () => {
		const configDir = getBuiltInPiConfigDir();
		const settings = JSON.parse(
			await fs.readFile(path.join(configDir, "settings.json"), "utf-8"),
		) as Record<string, unknown>;

		expect(settings.defaultProvider).toBeTruthy();
		expect(settings.defaultModel).toBeTruthy();
		for (const filename of ["auth.json", "models.json", "mcp.json", "tools.json", "permissions.json"]) {
			const content = await fs.readFile(path.join(configDir, filename), "utf-8");
			expect(JSON.parse(content)).toBeTruthy();
		}
		await expect(fs.access(path.join(configDir, "agents", ".keep"))).resolves.toBeUndefined();
		await expect(fs.access(path.join(configDir, "skills", ".keep"))).resolves.toBeUndefined();
		await expect(fs.access(path.join(configDir, "extensions", ".keep"))).resolves.toBeUndefined();
	});
});
