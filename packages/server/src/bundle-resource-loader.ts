import { DefaultResourceLoader, SettingsManager } from "@mariozechner/pi-coding-agent";
import type { RuntimeBundle } from "./runtime-bundle.js";
import { getPiDefaultAgentDir } from "./pi-default-config.js";

/**
 * Create a Pi DefaultResourceLoader backed by a materialized bundle directory.
 *
 * This points Pi at the directory that was overwritten with the server bundle.
 */
export function createBundleBackedResourceLoader(
	materializedDir: string,
	cwd: string,
): DefaultResourceLoader {
	const agentDir = materializedDir;
	const settingsManager = SettingsManager.create(cwd, agentDir);

	return new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		noExtensions: false,
		noSkills: false,
		noPromptTemplates: false,
		noThemes: false,
		noContextFiles: false,
	});
}

/**
 * Materialize a bundle and return the path to the materialized directory.
 * Uses Pi's default ~/.pi/agent config root so device-side bundle sync is overwrite-only.
 */
export async function materializeBundleToDeviceDir(
	_deviceId: string,
	bundle: RuntimeBundle,
): Promise<string> {
	const targetDir = getPiDefaultAgentDir();
	const { materializeBundle } = await import("./runtime-bundle.js");
	await materializeBundle(bundle, targetDir);
	return targetDir;
}
