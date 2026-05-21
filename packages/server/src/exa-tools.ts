import { Type } from "@sinclair/typebox";
import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { normalizeString } from "./utils/strings.js";

export const EXA_TOOL_NAMES = ["exa_get_contents"] as const;

export interface ExaToolsConfig {
	apiKey: string;
	baseUrl: string;
}

export interface ExaGetContentsResultDetails {
	url: string;
	title: string;
	text: string;
	publishedDate?: string;
	author?: string;
}

export type ExaGetContentsResult = AgentToolResult<ExaGetContentsResultDetails>;

type FetchLike = typeof fetch;

interface ExaContentsResponse {
	results?: Array<{
		url?: string;
		title?: string;
		text?: string;
		publishedDate?: string;
		author?: string;
	}>;
}

export interface ExaToolExecutorsOptions {
	loadConfig?: () => Promise<ExaToolsConfig | null>;
	fetchImpl?: FetchLike;
}

const ExaGetContentsSchema = Type.Object({
	url: Type.String({ description: "公开网页 URL，支持 HTTP/HTTPS" }),
});

const DEFAULT_EXA_BASE_URL = "https://api.exa.ai";

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const isPrivateHostname = (hostname: string): boolean => {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized === "0.0.0.0" ||
		normalized.startsWith("127.") ||
		normalized.startsWith("10.") ||
		normalized.startsWith("192.168.") ||
		/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd")
	);
};

const ensurePublicHttpUrl = (value: unknown): string => {
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
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new Error("url 只支持 HTTP/HTTPS");
	}
	if (isPrivateHostname(parsed.hostname)) {
		throw new Error("url 必须是公开网页地址");
	}
	return parsed.toString();
};

export async function loadExaToolsConfigFromEnv(
	env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<ExaToolsConfig | null> {
	const apiKey = normalizeString(env.EXA_API_KEY);
	if (!apiKey) {
		return null;
	}
	const baseUrl = normalizeBaseUrl(
		normalizeString(env.EXA_BASE_URL) || DEFAULT_EXA_BASE_URL,
	);
	return { apiKey, baseUrl };
}

const buildMarkdown = (details: ExaGetContentsResultDetails): string => {
	const lines = [
		`# ${details.title || details.url}`,
		"",
		`URL: ${details.url}`,
	];
	if (details.publishedDate) {
		lines.push(`Published: ${details.publishedDate}`);
	}
	if (details.author) {
		lines.push(`Author: ${details.author}`);
	}
	lines.push("", details.text);
	return lines.join("\n").trim();
};

const buildResult = (details: ExaGetContentsResultDetails): ExaGetContentsResult => ({
	content: [
		{
			type: "text",
			text: buildMarkdown(details),
		},
	],
	details,
});

export const createExaToolExecutors = (
	options: ExaToolExecutorsOptions = {},
) => {
	const loadConfig = options.loadConfig ?? loadExaToolsConfigFromEnv;
	const fetchImpl = options.fetchImpl ?? fetch;

	return {
		async exa_get_contents(params: Record<string, unknown>): Promise<ExaGetContentsResult> {
			const url = ensurePublicHttpUrl(params.url);
			const config = await loadConfig();
			if (!config) {
				throw new Error("Exa API 未配置：缺少 EXA_API_KEY");
			}

			const response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl)}/contents`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": config.apiKey,
				},
				body: JSON.stringify({
					urls: [url],
					text: true,
				}),
			});
			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw new Error(`Exa 内容提取失败: HTTP ${response.status}${body ? ` ${body}` : ""}`);
			}
			const payload = await response.json() as ExaContentsResponse;
			const result = payload.results?.[0];
			const text = normalizeString(result?.text);
			if (!result || !text) {
				throw new Error("Exa 内容提取结果为空");
			}
			return buildResult({
				url: normalizeString(result.url) || url,
				title: normalizeString(result.title) || url,
				text,
				publishedDate: normalizeString(result.publishedDate) || undefined,
				author: normalizeString(result.author) || undefined,
			});
		},
	};
};

export const createExaToolsExtension =
	() =>
	(pi: ExtensionAPI): void => {
		const executors = createExaToolExecutors();

		pi.registerTool({
			name: "exa_get_contents",
			label: "Exa Get Contents",
			description: "调用 Exa 官方 Contents API 提取公开网页正文。处理 URL 闪念时优先调用它获取页面内容，再写入剪藏或资料。",
			parameters: ExaGetContentsSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.exa_get_contents(params);
			},
		});
	};
