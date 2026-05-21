import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ENV_FILENAMES = [".env", ".env.local"] as const;
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface LoadServerEnvFilesOptions {
	cwd?: string;
	repoRoot?: string;
	env?: NodeJS.ProcessEnv;
	filenames?: readonly string[];
}

export interface LoadServerEnvFilesResult {
	loadedFiles: string[];
	loadedKeys: string[];
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(currentDir, "../../..");

const stripInlineComment = (value: string): string => {
	let quote: string | null = null;
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if ((char === "\"" || char === "'") && value[index - 1] !== "\\") {
			quote = quote === char ? null : quote ?? char;
			continue;
		}
		if (char === "#" && !quote && /\s/.test(value[index - 1] ?? "")) {
			return value.slice(0, index).trimEnd();
		}
	}
	return value.trimEnd();
};

const unquoteValue = (value: string): string => {
	const trimmed = stripInlineComment(value.trim());
	if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
		return trimmed.slice(1, -1)
			.replaceAll("\\n", "\n")
			.replaceAll("\\r", "\r")
			.replaceAll("\\t", "\t")
			.replaceAll("\\\"", "\"")
			.replaceAll("\\\\", "\\");
	}
	if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
};

export const parseDotenvContent = (content: string): Record<string, string> => {
	const values: Record<string, string> = {};
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const normalized = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
		const equalsIndex = normalized.indexOf("=");
		if (equalsIndex <= 0) continue;
		const key = normalized.slice(0, equalsIndex).trim();
		if (!KEY_PATTERN.test(key)) continue;
		values[key] = unquoteValue(normalized.slice(equalsIndex + 1));
	}
	return values;
};

const isSubPath = (child: string, parent: string): boolean => {
	const relative = path.relative(parent, child);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const collectDirs = (cwd: string, repoRoot: string): string[] => {
	const resolvedCwd = path.resolve(cwd);
	const resolvedRepoRoot = path.resolve(repoRoot);
	if (!isSubPath(resolvedCwd, resolvedRepoRoot)) {
		return Array.from(new Set([resolvedRepoRoot, resolvedCwd]));
	}
	const dirs: string[] = [];
	let current = resolvedCwd;
	while (isSubPath(current, resolvedRepoRoot)) {
		dirs.push(current);
		if (current === resolvedRepoRoot) break;
		current = path.dirname(current);
	}
	return dirs.reverse();
};

export const loadServerEnvFiles = (
	options: LoadServerEnvFilesOptions = {},
): LoadServerEnvFilesResult => {
	const env = options.env ?? process.env;
	const originalKeys = new Set(Object.keys(env));
	const filenames = options.filenames ?? DEFAULT_ENV_FILENAMES;
	const dirs = collectDirs(options.cwd ?? process.cwd(), options.repoRoot ?? defaultRepoRoot);
	const pending: Record<string, string> = {};
	const loadedFiles: string[] = [];

	for (const dir of dirs) {
		for (const filename of filenames) {
			const filePath = path.join(dir, filename);
			if (!fs.existsSync(filePath)) continue;
			const parsed = parseDotenvContent(fs.readFileSync(filePath, "utf-8"));
			Object.assign(pending, parsed);
			loadedFiles.push(filePath);
		}
	}

	const loadedKeys: string[] = [];
	for (const [key, value] of Object.entries(pending)) {
		if (originalKeys.has(key)) continue;
		env[key] = value;
		loadedKeys.push(key);
	}

	return { loadedFiles, loadedKeys };
};

loadServerEnvFiles();
