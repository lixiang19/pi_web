import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import {
	ConversionServiceClient,
	deriveTaskFromExtension,
	loadConversionServiceConfigFromDb,
	type ConversionJob,
	type ConversionOptions,
	type ConversionServiceConfig,
	type DownloadedArtifact,
} from "./conversion-service-client.js";
import {
	ensureResolvedPathWithinRoot,
	ensureWithinRoot,
} from "./file-manager.js";
import { normalizeString } from "./utils/strings.js";

export const CONVERSION_TOOL_NAMES = [
	"convert_file_to_markdown",
	"convert_url_to_markdown",
] as const;

export interface ConversionToolResultDetails {
	task: string;
	sourcePath?: string;
	url?: string;
	jobId: string;
	markdown: string;
	artifacts: Array<{ name: string; mimeType: string; size: number }>;
}

export type ConversionToolResult = AgentToolResult<ConversionToolResultDetails>;

export interface ConversionToolExecutorsOptions {
	workspaceDir: string;
	loadConfig?: () => Promise<ConversionServiceConfig | null>;
	createClient?: (config: ConversionServiceConfig) => Pick<
		ConversionServiceClient,
		"createConversion" | "createConversionWithFile" | "downloadArtifacts"
	>;
}

const ConvertFileSchema = Type.Object({
	path: Type.String({ description: "工作空间内文件路径，可用相对路径或绝对路径" }),
	task: Type.Optional(Type.Union([
		Type.Literal("document.markdown"),
		Type.Literal("audio.transcription"),
		Type.Literal("image.ocr"),
		Type.Literal("image.description"),
		Type.Literal("document.ocr_markdown"),
	], { description: "不传时根据扩展名自动推断" })),
	engine: Type.Optional(Type.String({ description: "可选转换引擎，如 groq、vision、markitdown、tesseract、faster-whisper" })),
	model: Type.Optional(Type.String({ description: "可选模型 ID" })),
	language: Type.Optional(Type.String({ description: "可选语言，如 auto、zh、en" })),
	prompt: Type.Optional(Type.String({ description: "可选提示词，用于视觉 OCR/图片描述或音频转写" })),
});

const ConvertUrlSchema = Type.Object({
	url: Type.String({ description: "HTTPS URL" }),
	mimeType: Type.Optional(Type.String({ description: "可选 MIME 类型，默认 text/html" })),
});

const normalizeToolPath = async (
	workspaceDir: string,
	value: unknown,
): Promise<{ absolutePath: string; relativePath: string }> => {
	const rawPath = normalizeString(value);
	if (!rawPath) {
		throw new Error("缺少 path 参数");
	}
	const absolutePath = path.isAbsolute(rawPath)
		? path.resolve(rawPath)
		: path.resolve(workspaceDir, rawPath);
	ensureWithinRoot(absolutePath, path.resolve(workspaceDir));
	await ensureResolvedPathWithinRoot(absolutePath, workspaceDir);
	const stat = await fs.stat(absolutePath);
	if (!stat.isFile()) {
		throw new Error("path 必须指向工作空间内的文件");
	}
	const relativePath = path.relative(workspaceDir, absolutePath).replaceAll(path.sep, "/");
	return { absolutePath, relativePath };
};

const ensureHttpsUrl = (value: unknown): string => {
	const rawUrl = normalizeString(value);
	if (!rawUrl) {
		throw new Error("缺少 url 参数");
	}
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error("url 必须是合法 URL");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("url 只支持 HTTPS");
	}
	return parsed.toString();
};

const optionsFromParams = (params: Record<string, unknown>, fallback?: ConversionOptions): ConversionOptions | undefined => {
	const options: ConversionOptions = { ...(fallback ?? {}) };
	for (const key of ["engine", "model", "language", "prompt"] as const) {
		const value = normalizeString(params[key]);
		if (value) {
			options[key] = value as never;
		}
	}
	return Object.keys(options).length > 0 ? options : undefined;
};

const getMarkdownArtifact = async (
	client: Pick<ConversionServiceClient, "downloadArtifacts">,
	job: ConversionJob,
): Promise<{ markdown: string; artifacts: DownloadedArtifact[] }> => {
	if (job.status !== "succeeded") {
		throw new Error(job.error?.message || "转换失败");
	}
	const artifacts = await client.downloadArtifacts(job, {
		timeoutMs: 60_000,
		maxSizeBytes: 20 * 1024 * 1024,
	});
	const markdownArtifact = artifacts.find(({ artifact }) =>
		artifact.mimeType === "text/markdown" || artifact.name.toLowerCase().endsWith(".md")
	);
	if (!markdownArtifact) {
		throw new Error("转换结果缺少 Markdown artifact");
	}
	const markdown = markdownArtifact.buffer.toString("utf-8").trim();
	if (!markdown) {
		throw new Error("转换结果为空");
	}
	return { markdown, artifacts };
};

const buildResult = (
	details: ConversionToolResultDetails,
): ConversionToolResult => ({
	content: [
		{
			type: "text",
			text: details.markdown,
		},
	],
	details,
});

const requireConfig = async (
	loadConfig: () => Promise<ConversionServiceConfig | null>,
): Promise<ConversionServiceConfig> => {
	const config = await loadConfig();
	if (!config) {
		throw new Error("Python 转化服务未配置：缺少 python_converter_base_url 或 python_converter_api_key");
	}
	return config;
};

export const createConversionToolExecutors = (
	options: ConversionToolExecutorsOptions,
) => {
	const loadConfig = options.loadConfig ?? loadConversionServiceConfigFromDb;
	const createClient = options.createClient ?? ((config: ConversionServiceConfig) =>
		new ConversionServiceClient({
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
		}));
	const workspaceDir = path.resolve(options.workspaceDir);

	return {
		async convert_file_to_markdown(params: Record<string, unknown>): Promise<ConversionToolResult> {
			const { absolutePath, relativePath } = await normalizeToolPath(workspaceDir, params.path);
			const task = normalizeString(params.task) || deriveTaskFromExtension(path.extname(absolutePath));
			if (!task) {
				throw new Error("无法根据文件扩展名推断转换任务，请显式传入 task");
			}
			const config = await requireConfig(loadConfig);
			const client = createClient(config);
			const job = await client.createConversionWithFile(absolutePath, {
				task: task as never,
				options: optionsFromParams(params),
				clientJobId: `pi-tool-${relativePath.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`,
				metadata: {
					source: "pi.tool",
					workspacePath: relativePath,
				},
				preferredFormat: "markdown",
				waitMs: 30_000,
			});
			const { markdown, artifacts } = await getMarkdownArtifact(client, job);
			return buildResult({
				task,
				sourcePath: relativePath,
				jobId: job.jobId,
				markdown,
				artifacts: artifacts.map(({ artifact }) => ({
					name: artifact.name,
					mimeType: artifact.mimeType,
					size: artifact.size,
				})),
			});
		},

		async convert_url_to_markdown(params: Record<string, unknown>): Promise<ConversionToolResult> {
			const url = ensureHttpsUrl(params.url);
			const config = await requireConfig(loadConfig);
			const client = createClient(config);
			const job = await client.createConversion({
				task: "document.markdown",
				input: {
					url,
					mimeType: normalizeString(params.mimeType) || "text/html",
				},
				options: { engine: "markitdown" },
				clientJobId: `pi-tool-url-${Date.now()}`,
				metadata: {
					source: "pi.tool",
					url,
				},
				preferredFormat: "markdown",
				waitMs: 30_000,
			});
			const { markdown, artifacts } = await getMarkdownArtifact(client, job);
			return buildResult({
				task: "document.markdown",
				url,
				jobId: job.jobId,
				markdown,
				artifacts: artifacts.map(({ artifact }) => ({
					name: artifact.name,
					mimeType: artifact.mimeType,
					size: artifact.size,
				})),
			});
		},
	};
};

export const createConversionToolsExtension =
	(workspaceDir: string) =>
	(pi: ExtensionAPI): void => {
		const executors = createConversionToolExecutors({ workspaceDir });

		pi.registerTool({
			name: "convert_file_to_markdown",
			label: "Convert File To Markdown",
			description: "调用 ridge Python Converter，将工作空间内文件转换为 Markdown。支持文档、图片 OCR、音频转写。",
			parameters: ConvertFileSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.convert_file_to_markdown(params);
			},
		});

		pi.registerTool({
			name: "convert_url_to_markdown",
			label: "Convert URL To Markdown",
			description: "调用 ridge Python Converter，将 HTTPS 网页 URL 转换为 Markdown。",
			parameters: ConvertUrlSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.convert_url_to_markdown(params);
			},
		});
	};
