import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import {
	ConversionServiceClient,
	deriveTaskFromExtension,
	loadConversionServiceConfigFromEnv,
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
] as const;

export interface ConversionToolResultDetails {
	task: string;
	sourcePath?: string;
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
		"createConversionWithFile" | "downloadArtifacts"
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
		throw new Error("Python 转化服务未配置：缺少 PYTHON_CONVERTER_BASE_URL 或 PYTHON_CONVERTER_API_KEY");
	}
	return config;
};

export const createConversionToolExecutors = (
	options: ConversionToolExecutorsOptions,
) => {
	const loadConfig = options.loadConfig ?? loadConversionServiceConfigFromEnv;
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

	};
