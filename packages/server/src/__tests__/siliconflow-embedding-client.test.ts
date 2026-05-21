import { describe, expect, it, vi } from "vitest";

import {
	DEFAULT_SILICONFLOW_EMBEDDING_BASE_URL,
	DEFAULT_SILICONFLOW_EMBEDDING_MODEL,
	MissingEmbeddingConfigError,
	SiliconFlowEmbeddingClient,
	loadSiliconFlowEmbeddingConfig,
} from "../siliconflow-embedding-client.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: { "Content-Type": "application/json" },
	});
}

describe("SiliconFlowEmbeddingClient", () => {
	it("sends text embeddings to SiliconFlow with bearer auth", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
			calls.push({ url: String(input), init: init ?? {} });
			return jsonResponse({
				model: DEFAULT_SILICONFLOW_EMBEDDING_MODEL,
				data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
			});
		});
		const client = new SiliconFlowEmbeddingClient({
			apiKey: "sf_test_key",
			fetchImpl,
		});

		const result = await client.embed({ type: "text", text: "Project Alpha" });

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const { url, init } = calls[0]!;
		expect(url).toBe(`${DEFAULT_SILICONFLOW_EMBEDDING_BASE_URL}/embeddings`);
		expect(init?.method).toBe("POST");
		expect(init?.headers).toMatchObject({
			Authorization: "Bearer sf_test_key",
			"Content-Type": "application/json",
		});
		expect(JSON.parse(String(init?.body))).toMatchObject({
			model: DEFAULT_SILICONFLOW_EMBEDDING_MODEL,
			input: "Project Alpha",
			encoding_format: "float",
		});
		expect(result.vector).toEqual([0.1, 0.2, 0.3]);
		expect(result.id).toMatch(/^siliconflow:Qwen\/Qwen3-VL-Embedding-8B:/);
	});

	it("sends image embeddings as VL image input with base64 data URL", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
			calls.push({ url: String(input), init: init ?? {} });
			return jsonResponse({
				model: DEFAULT_SILICONFLOW_EMBEDDING_MODEL,
				data: [{ embedding: [0.5, 0.5, 0], index: 0 }],
			});
		});
		const client = new SiliconFlowEmbeddingClient({
			apiKey: "sf_test_key",
			fetchImpl,
			dimensions: 1024,
		});

		const result = await client.embed({
			type: "image",
			buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
			mimeType: "image/png",
			sourceName: "diagram.png",
		});

		const { init } = calls[0]!;
		const body = JSON.parse(String(init?.body)) as { input: Array<Record<string, unknown>>; dimensions: number };
		expect(body.dimensions).toBe(1024);
		expect(body.input).toEqual([{
			image: "data:image/png;base64,iVBORw==",
		}]);
		expect(result.vector).toEqual([0.5, 0.5, 0]);
	});

	it("retries transient rate limits before succeeding", async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(jsonResponse({ error: { message: "rate limited" } }, { status: 429 }))
			.mockResolvedValueOnce(jsonResponse({ data: [{ embedding: [1, 0], index: 0 }] }));
		const client = new SiliconFlowEmbeddingClient({
			apiKey: "sf_test_key",
			fetchImpl,
			maxRetries: 1,
			retryDelayMs: 1,
		});

		const result = await client.embed({ type: "text", text: "retry" });

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(result.vector).toEqual([1, 0]);
	});

	it("loads config from environment variables", async () => {
		const config = await loadSiliconFlowEmbeddingConfig({
			SILICONFLOW_EMBEDDING_API_KEY: "env_key",
			SILICONFLOW_EMBEDDING_BASE_URL: "https://sf.example.com/v1",
			SILICONFLOW_EMBEDDING_MODEL: "Custom/Embedding",
			SILICONFLOW_EMBEDDING_DIMENSIONS: "2048",
		});

		expect(config).toMatchObject({
			apiKey: "env_key",
			baseUrl: "https://sf.example.com/v1",
			model: "Custom/Embedding",
			dimensions: 2048,
		});
	});

	it("fails explicitly when no API key is configured", async () => {
		await expect(loadSiliconFlowEmbeddingConfig({})).rejects.toBeInstanceOf(MissingEmbeddingConfigError);
	});
});
