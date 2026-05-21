import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	compileAgentPermission,
	derivePermissionPattern,
	extractPermissionSubject,
	mapToolToLogicalPermission,
} from "../agent-permissions.js";
import {
	createExaToolExecutors,
	EXA_TOOL_NAMES,
	loadExaToolsConfigFromEnv,
} from "../exa-tools.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

const firstTextContent = (result: { content: Array<{ type: string }> }) => {
	const content = result.content[0];
	if (!content || content.type !== "text" || !("text" in content)) {
		throw new Error("Expected a text tool result");
	}
	return content.text;
};

describe("exa tools", () => {
	it("loads config from environment variables", async () => {
		await expect(loadExaToolsConfigFromEnv({
			EXA_API_KEY: "env-exa-key",
			EXA_BASE_URL: "https://exa.example.com/",
		})).resolves.toEqual({
			apiKey: "env-exa-key",
			baseUrl: "https://exa.example.com",
		});
	});

	it("extracts URL contents through Exa official Contents API", async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
			results: [
				{
					id: "exa-result-1",
					url: "https://example.com/article",
					title: "Example Article",
					text: "This is the extracted article body.",
					publishedDate: "2026-05-21",
				},
			],
		}), {
			status: 200,
			headers: { "content-type": "application/json" },
		}));
		const executors = createExaToolExecutors({
			loadConfig: async () => ({ apiKey: "exa-key", baseUrl: "https://api.exa.ai" }),
			fetchImpl,
		});

		const result = await executors.exa_get_contents({
			url: "https://example.com/article",
		});

		expect(fetchImpl).toHaveBeenCalledWith("https://api.exa.ai/contents", expect.objectContaining({
			method: "POST",
			headers: expect.objectContaining({
				"x-api-key": "exa-key",
				"Content-Type": "application/json",
			}),
			body: JSON.stringify({
				urls: ["https://example.com/article"],
				text: true,
			}),
		}));
		expect(firstTextContent(result)).toContain("# Example Article");
		expect(firstTextContent(result)).toContain("This is the extracted article body.");
		expect(result.details).toMatchObject({
			url: "https://example.com/article",
			title: "Example Article",
			text: "This is the extracted article body.",
		});
	});

	it("requires Exa API key configuration", async () => {
		const executors = createExaToolExecutors({
			loadConfig: async () => null,
			fetchImpl: vi.fn(),
		});

		await expect(
			executors.exa_get_contents({ url: "https://example.com/article" }),
		).rejects.toThrow("Exa API 未配置");
	});

	it("rejects non-public URL schemes before sending anything to Exa", async () => {
		const fetchImpl = vi.fn();
		const executors = createExaToolExecutors({
			loadConfig: async () => ({ apiKey: "exa-key", baseUrl: "https://api.exa.ai" }),
			fetchImpl,
		});

		await expect(
			executors.exa_get_contents({ url: "file:///etc/passwd" }),
		).rejects.toThrow("url 只支持 HTTP/HTTPS");
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe("exa tool permissions", () => {
	it("maps Exa URL extraction to read permission", () => {
		for (const toolName of EXA_TOOL_NAMES) {
			expect(mapToolToLogicalPermission(toolName)).toBe("read");
		}
	});

	it("uses URL as permission subject and pattern", () => {
		expect(extractPermissionSubject(WORKSPACE, "exa_get_contents", { url: "https://example.com" }))
			.toBe("https://example.com");
		expect(derivePermissionPattern(WORKSPACE, "exa_get_contents", { url: "https://example.com" }))
			.toBe("https://example.com");
	});

	it("removes Exa tools when read is denied", () => {
		const policy = compileAgentPermission(WORKSPACE, { read: "deny" }, [
			"read",
			"exa_get_contents",
		]);

		expect(policy.activeToolNames).not.toContain("read");
		expect(policy.activeToolNames).not.toContain("exa_get_contents");
	});
});
