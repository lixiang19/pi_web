import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPiDefaultAgentDir } from "./pi-default-config.js";

export interface SyncBuiltInPiConfigOptions {
	sourceDir?: string;
	targetAgentDir?: string;
}

export interface SyncBuiltInPiConfigResult {
	sourceDir: string;
	targetAgentDir: string;
	written: string[];
}

export const getBuiltInPiConfigDir = (): string =>
	path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
		"pi-default-config",
	);

export async function syncBuiltInPiConfigToDefaultAgentDir(
	options: SyncBuiltInPiConfigOptions = {},
): Promise<SyncBuiltInPiConfigResult> {
	const sourceDir = options.sourceDir ?? getBuiltInPiConfigDir();
	const targetAgentDir = options.targetAgentDir ?? getPiDefaultAgentDir();
	const sourceStats = await fs.stat(sourceDir);
	if (!sourceStats.isDirectory()) {
		throw new Error(`Built-in Pi config path is not a directory: ${sourceDir}`);
	}

	const entries = await fs.readdir(sourceDir, { withFileTypes: true });
	const written = entries
		.filter((entry) => entry.isFile() || entry.isDirectory())
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));

	await fs.mkdir(targetAgentDir, { recursive: true });
	await fs.cp(sourceDir, targetAgentDir, {
		recursive: true,
		force: true,
	});

	return { sourceDir, targetAgentDir, written };
}
