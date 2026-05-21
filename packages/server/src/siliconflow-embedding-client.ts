import crypto from "node:crypto";

export const DEFAULT_SILICONFLOW_EMBEDDING_BASE_URL = "https://api.siliconflow.cn/v1";
export const DEFAULT_SILICONFLOW_EMBEDDING_MODEL = "Qwen/Qwen3-VL-Embedding-8B";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

export type RagEmbeddingInput =
	| { type: "text"; text: string }
	| { type: "image"; buffer: Buffer; mimeType: string; sourceName?: string };

export interface RagEmbeddingResult {
	id: string;
	vector: number[];
	model: string;
}

export interface RagEmbeddingProvider {
	embed(input: RagEmbeddingInput): Promise<RagEmbeddingResult>;
}

export interface SiliconFlowEmbeddingConfig {
	apiKey: string;
	baseUrl: string;
	model: string;
	dimensions?: number;
	timeoutMs: number;
	maxRetries: number;
}

export interface SiliconFlowEmbeddingClientOptions extends SiliconFlowEmbeddingConfig {
	fetchImpl?: typeof fetch;
	retryDelayMs?: number;
}

type EmbeddingResponse = {
	model?: string;
	data?: Array<{ embedding?: unknown; index?: number }>;
	error?: { message?: string; code?: string };
};

export class MissingEmbeddingConfigError extends Error {
	constructor(message = "SiliconFlow embedding API key is not configured") {
		super(message);
		this.name = "MissingEmbeddingConfigError";
	}
}

export class SiliconFlowEmbeddingError extends Error {
	constructor(
		message: string,
		public readonly httpStatus?: number,
		public readonly code?: string,
	) {
		super(message);
		this.name = "SiliconFlowEmbeddingError";
	}
}

function envValue(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string): string | null {
	const value = env[key]?.trim();
	return value ? value : null;
}

function parsePositiveInteger(value: string | null, fallback?: number): number | undefined {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function loadSiliconFlowEmbeddingConfig(
	env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<SiliconFlowEmbeddingConfig> {
	const apiKey =
		envValue(env, "SILICONFLOW_EMBEDDING_API_KEY") ??
		envValue(env, "SILICONFLOW_API_KEY");
	if (!apiKey) {
		throw new MissingEmbeddingConfigError();
	}
	const baseUrl =
		envValue(env, "SILICONFLOW_EMBEDDING_BASE_URL") ??
		envValue(env, "SILICONFLOW_BASE_URL") ??
		DEFAULT_SILICONFLOW_EMBEDDING_BASE_URL;
	const model =
		envValue(env, "SILICONFLOW_EMBEDDING_MODEL") ??
		DEFAULT_SILICONFLOW_EMBEDDING_MODEL;
	const dimensions = parsePositiveInteger(
		envValue(env, "SILICONFLOW_EMBEDDING_DIMENSIONS"),
	);
	const timeoutMs = parsePositiveInteger(
		envValue(env, "SILICONFLOW_EMBEDDING_TIMEOUT_MS"),
		DEFAULT_TIMEOUT_MS,
	) ?? DEFAULT_TIMEOUT_MS;
	const maxRetries = parsePositiveInteger(
		envValue(env, "SILICONFLOW_EMBEDDING_MAX_RETRIES"),
		DEFAULT_MAX_RETRIES,
	) ?? DEFAULT_MAX_RETRIES;
	return {
		apiKey,
		baseUrl,
		model,
		dimensions,
		timeoutMs,
		maxRetries,
	};
}

export async function loadSiliconFlowEmbeddingConfigFromEnv(): Promise<SiliconFlowEmbeddingConfig> {
	return loadSiliconFlowEmbeddingConfig(process.env);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createEmbeddingId(model: string, vector: number[]): string {
	const digest = crypto.createHash("sha256").update(JSON.stringify(vector)).digest("hex");
	return `siliconflow:${model}:${vector.length}:${digest}`;
}

function isTransientStatus(status: number): boolean {
	return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function normalizeVector(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => typeof item === "number" && Number.isFinite(item) ? item : 0);
}

export class SiliconFlowEmbeddingClient implements RagEmbeddingProvider {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly model: string;
	private readonly dimensions?: number;
	private readonly timeoutMs: number;
	private readonly maxRetries: number;
	private readonly retryDelayMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(options: Partial<SiliconFlowEmbeddingClientOptions> & { apiKey: string }) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_SILICONFLOW_EMBEDDING_BASE_URL).replace(/\/+$/, "");
		this.apiKey = options.apiKey;
		this.model = options.model ?? DEFAULT_SILICONFLOW_EMBEDDING_MODEL;
		this.dimensions = options.dimensions;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
		this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
		this.fetchImpl = options.fetchImpl ?? fetch;
	}

	async embed(input: RagEmbeddingInput): Promise<RagEmbeddingResult> {
		const response = await this.request(input);
		const vector = normalizeVector(response.data?.[0]?.embedding);
		if (vector.length === 0) {
			throw new SiliconFlowEmbeddingError("SiliconFlow embedding response did not include a numeric vector");
		}
		const model = response.model ?? this.model;
		return {
			id: createEmbeddingId(model, vector),
			vector,
			model,
		};
	}

	private async request(input: RagEmbeddingInput): Promise<EmbeddingResponse> {
		let attempt = 0;
		while (true) {
			try {
				return await this.requestOnce(input);
			} catch (error) {
				const embeddingError = error instanceof SiliconFlowEmbeddingError ? error : null;
				if (
					attempt >= this.maxRetries ||
					(embeddingError?.httpStatus !== undefined && !isTransientStatus(embeddingError.httpStatus))
				) {
					throw error;
				}
				await sleep(this.retryDelayMs * (attempt + 1));
				attempt++;
			}
		}
	}

	private async requestOnce(input: RagEmbeddingInput): Promise<EmbeddingResponse> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(this.buildBody(input)),
				signal: controller.signal,
			});
			const body = await this.readJson(response);
			if (!response.ok) {
				const errorMessage = body.error?.message ?? `SiliconFlow embedding request failed with HTTP ${response.status}`;
				throw new SiliconFlowEmbeddingError(errorMessage, response.status, body.error?.code);
			}
			return body;
		} catch (error) {
			if (error instanceof SiliconFlowEmbeddingError) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new SiliconFlowEmbeddingError(`SiliconFlow embedding request failed: ${message}`);
		} finally {
			clearTimeout(timeout);
		}
	}

	private buildBody(input: RagEmbeddingInput): Record<string, unknown> {
		const body: Record<string, unknown> = {
			model: this.model,
			input: this.toSiliconFlowInput(input),
			encoding_format: "float",
		};
		if (this.dimensions) {
			body.dimensions = this.dimensions;
		}
		return body;
	}

	private toSiliconFlowInput(input: RagEmbeddingInput): unknown {
		if (input.type === "text") return input.text;
		return [{
			image: `data:${input.mimeType};base64,${input.buffer.toString("base64")}`,
		}];
	}

	private async readJson(response: Response): Promise<EmbeddingResponse> {
		try {
			return await response.json() as EmbeddingResponse;
		} catch {
			return {};
		}
	}
}

export async function createSiliconFlowEmbeddingProvider(): Promise<RagEmbeddingProvider> {
	return new SiliconFlowEmbeddingClient(await loadSiliconFlowEmbeddingConfigFromEnv());
}
