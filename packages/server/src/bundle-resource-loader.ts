import path from "node:path";
import { DefaultResourceLoader, SettingsManager } from "@mariozechner/pi-coding-agent";
import type { RuntimeBundle } from "./runtime-bundle.js";

/**
 * Create a Pi DefaultResourceLoader backed by a materialized bundle directory.
 *
 * This ensures Pi reads agents/skills/config from the server-provided bundle
 * instead of the desktop's real ~/.pi directory.
 */
export function createBundleBackedResourceLoader(
	materializedDir: string,
	cwd: string,
): DefaultResourceLoader {
	const agentDir = path.join(materializedDir, "agents");
	const skillsDir = path.join(materializedDir, "skills");
	const settingsManager = SettingsManager.create(cwd, agentDir);

	return new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		// Pull skills from the materialized bundle skills directory
		additionalSkillPaths: [skillsDir],
		// Do not load from real user home
		noExtensions: false,
		noSkills: false,
		noPromptTemplates: false,
		noThemes: false,
		noContextFiles: false,
	});
}

/**
 * Materialize a bundle and return the path to the materialized directory.
 * Uses a deterministic path under the OS tmpdir for the device.
 */
export async function materializeBundleToDeviceDir(
	deviceId: string,
	bundle: RuntimeBundle,
): Promise<string> {
	const targetDir = path.join(
		process.env.RIDGE_BUNDLE_DIR || path.join(process.env.HOME || "/tmp", ".ridge", "bundles"),
		deviceId,
	);
	const { materializeBundle } = await import("./runtime-bundle.js");
	await materializeBundle(bundle, targetDir);
	return targetDir;
}
