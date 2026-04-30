import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import type {
	FilePreviewPayload,
	FilePreviewWindowPayload,
	HttpError,
} from "../types/index.js";
import { normalizeOptionalFsPath } from "./file-manager.js";
import { getFileManager } from "./session-payload.js";
import { toPosixPath } from "./utils/paths.js";

// File preview utilities

export const MAX_FILE_PREVIEW_BYTES = 5 * 1024 * 1024;
const UTF8_SNIFF_BYTES = 100 * 1024;
export const LARGE_FILE_PREVIEW_LINE_COUNT = 1000;

export const imageMimeTypesByExtension = new Map<string, string>([
	[".avif", "image/avif"],
	[".bmp", "image/bmp"],
	[".gif", "image/gif"],
	[".jpeg", "image/jpeg"],
	[".jpg", "image/jpeg"],
	[".png", "image/png"],
	[".svg", "image/svg+xml"],
	[".webp", "image/webp"],
]);

const markdownExtensions = new Set([".md", ".markdown"]);
const htmlExtensions = new Set([".htm", ".html"]);
const codeExtensions = new Set([
	".astro",
	".bash",
	".c",
	".cc",
	".cpp",
	".css",
	".cts",
	".cxx",
	".go",
	".h",
	".hpp",
	".ini",
	".java",
	".js",
	".json",
	".jsx",
	".kt",
	".less",
	".lua",
	".mjs",
	".mts",
	".php",
	".py",
	".rb",
	".rs",
	".scss",
	".sh",
	".sql",
	".swift",
	".toml",
	".ts",
	".tsx",
	".vue",
	".xml",
	".yaml",
	".yml",
	".zsh",
]);
const codeFileNames = new Set(["dockerfile"]);

const execFileAsync = promisify(execFile);

export const openWithDefaultApp = async (targetPath: string): Promise<void> => {
	if (process.platform === "win32") {
		const { exec: execCmd } = await import("node:child_process");
		const execCmdAsync = promisify(execCmd);
		await execCmdAsync(`cmd /c start "" ${JSON.stringify(targetPath)}`);
	} else if (process.platform === "darwin") {
		await execFileAsync("open", [targetPath]);
	} else {
		await execFileAsync("xdg-open", [targetPath]);
	}
};

export const resolveDiscoveryCwd = (value: unknown): string =>
	normalizeOptionalFsPath(value) || path.resolve(os.homedir());

export const ensureFileForPreview = async (options: {
	root?: unknown;
	path?: unknown;
}): Promise<{
	rootPath: string;
	targetPath: string;
	stats: Awaited<ReturnType<typeof fs.stat>>;
}> => {
	const { rootPath, targetPath } =
		await getFileManager().resolveManagedFileLocation(options);
	const stats = await fs.stat(targetPath);

	if (!stats.isFile()) {
		const error = new Error("Requested path is not a file") as HttpError;
		error.statusCode = 400;
		throw error;
	}

	return {
		rootPath,
		targetPath,
		stats,
	};
};

export const toFileSize = (value: number | bigint): number => Number(value);

const decodeUtf8File = (buffer: Buffer): string | null => {
	if (buffer.includes(0)) {
		return null;
	}

	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
	} catch {
		return null;
	}
};

const readUtf8Head = async (
	targetPath: string,
	maxBytes = UTF8_SNIFF_BYTES,
): Promise<string | null> => {
	const handle = await fs.open(targetPath, "r");

	try {
		const stats = await handle.stat();
		const bufferSize = Math.max(1, Math.min(toFileSize(stats.size), maxBytes));
		const buffer = Buffer.allocUnsafe(bufferSize);
		const { bytesRead } = await handle.read(buffer, 0, bufferSize, 0);
		return decodeUtf8File(buffer.subarray(0, bytesRead));
	} finally {
		await handle.close();
	}
};

const readTextWindow = async (
	targetPath: string,
	startLine: number,
	lineCount: number,
): Promise<{
	content: string;
	lineCount: number;
	hasMore: boolean;
	nextStartLine?: number;
}> => {
	const lines: string[] = [];
	const stream = createReadStream(targetPath, { encoding: "utf8" });
	const reader = createInterface({
		input: stream,
		crlfDelay: Infinity,
	});

	let currentLine = 0;
	let hasMore = false;

	try {
		for await (const line of reader) {
			currentLine += 1;

			if (currentLine < startLine) {
				continue;
			}

			if (lines.length < lineCount) {
				lines.push(line);
				continue;
			}

			hasMore = true;
			reader.close();
			stream.destroy();
			break;
		}
	} finally {
		reader.close();
		stream.destroy();
	}

	const nextStartLine = hasMore ? startLine + lines.length : undefined;

	return {
		content: lines.join("\n"),
		lineCount: lines.length,
		hasMore,
		nextStartLine,
	};
};

const resolvePreviewKind = (
	fileName: string,
	extension: string,
	isTextReadable: boolean,
): FilePreviewPayload["previewKind"] => {
	if (imageMimeTypesByExtension.has(extension)) {
		return "image";
	}

	if (!isTextReadable) {
		return "unsupported";
	}

	if (markdownExtensions.has(extension)) {
		return "markdown";
	}

	if (extension === ".base") {
		return "base";
	}

	if (extension === ".canvas") {
		return "canvas";
	}

	if (htmlExtensions.has(extension)) {
		return "html";
	}

	if (codeExtensions.has(extension)) {
		return "code";
	}

	const normalizedFileName = fileName.trim().toLowerCase();
	if (
		codeFileNames.has(normalizedFileName) ||
		normalizedFileName.startsWith("dockerfile.")
	) {
		return "code";
	}

	return "text";
};

const resolvePreviewMimeType = (
	extension: string,
	previewKind: FilePreviewPayload["previewKind"],
): string => {
	if (previewKind === "image") {
		return (
			imageMimeTypesByExtension.get(extension) || "application/octet-stream"
		);
	}

	if (previewKind === "markdown") {
		return "text/markdown; charset=utf-8";
	}

	if (extension === ".json") {
		return "application/json; charset=utf-8";
	}

	if (htmlExtensions.has(extension)) {
		return "text/html; charset=utf-8";
	}

	if (extension === ".css") {
		return "text/css; charset=utf-8";
	}

	if (extension === ".xml") {
		return "application/xml; charset=utf-8";
	}

	if (previewKind === "unsupported") {
		return "application/octet-stream";
	}

	return "text/plain; charset=utf-8";
};

export const buildFilePreviewWindowPayload = async (
	rootPath: string,
	targetPath: string,
	stats: Awaited<ReturnType<typeof fs.stat>>,
	startLine: number,
	lineCount: number,
): Promise<FilePreviewWindowPayload> => {
	const extension = path.extname(targetPath).toLowerCase();
	const name = path.basename(targetPath);
	const previewHead = await readUtf8Head(targetPath);
	const previewKind = resolvePreviewKind(name, extension, previewHead !== null);

	if (previewKind !== "code" && previewKind !== "text") {
		const error = new Error(
			"Windowed preview is only available for code or text files",
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}

	if (toFileSize(stats.size) <= MAX_FILE_PREVIEW_BYTES) {
		const error = new Error(
			"Windowed preview is only available for large files",
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}

	const windowPayload = await readTextWindow(targetPath, startLine, lineCount);

	return {
		root: toPosixPath(rootPath),
		path: toPosixPath(targetPath),
		startLine,
		lineCount: windowPayload.lineCount,
		content: windowPayload.content,
		hasMore: windowPayload.hasMore,
		nextStartLine: windowPayload.nextStartLine,
	};
};

export const buildFilePreviewPayload = async (
	rootPath: string,
	targetPath: string,
	stats: Awaited<ReturnType<typeof fs.stat>>,
): Promise<FilePreviewPayload> => {
	const extension = path.extname(targetPath).toLowerCase();
	const name = path.basename(targetPath);
	const imageMimeType = imageMimeTypesByExtension.get(extension);
	const size = toFileSize(stats.size);

	if (imageMimeType) {
		return {
			root: toPosixPath(rootPath),
			path: toPosixPath(targetPath),
			name,
			extension,
			mimeType: imageMimeType,
			size,
			previewKind: "image",
			readOnly: true,
		};
	}

	const previewHead =
		size > MAX_FILE_PREVIEW_BYTES ? await readUtf8Head(targetPath) : null;
	const previewKind =
		previewHead === null && size <= MAX_FILE_PREVIEW_BYTES
			? "unsupported"
			: resolvePreviewKind(
					name,
					extension,
					previewHead !== null || size <= MAX_FILE_PREVIEW_BYTES,
				);

	if (size > MAX_FILE_PREVIEW_BYTES) {
		if (previewKind !== "code" && previewKind !== "text") {
			return {
				root: toPosixPath(rootPath),
				path: toPosixPath(targetPath),
				name,
				extension,
				mimeType: resolvePreviewMimeType(extension, "unsupported"),
				size,
				previewKind: "unsupported",
				readOnly: true,
			};
		}

		const windowPayload = await buildFilePreviewWindowPayload(
			rootPath,
			targetPath,
			stats,
			1,
			LARGE_FILE_PREVIEW_LINE_COUNT,
		);

		return {
			root: toPosixPath(rootPath),
			path: toPosixPath(targetPath),
			name,
			extension,
			mimeType: resolvePreviewMimeType(extension, previewKind),
			size,
			previewKind,
			content: windowPayload.content,
			isLargeFile: true,
			previewLineCount: windowPayload.lineCount,
			nextStartLine: windowPayload.nextStartLine,
			readOnly: true,
		};
	}

	const buffer = await fs.readFile(targetPath);
	const content = decodeUtf8File(buffer);
	const resolvedPreviewKind = resolvePreviewKind(
		name,
		extension,
		content !== null,
	);

	return {
		root: toPosixPath(rootPath),
		path: toPosixPath(targetPath),
		name,
		extension,
		mimeType: resolvePreviewMimeType(extension, resolvedPreviewKind),
		size,
		previewKind: resolvedPreviewKind,
		content: content ?? undefined,
		readOnly: resolvedPreviewKind !== "markdown",
	};
};
