import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	compileAgentPermission,
	derivePermissionPattern,
	extractPermissionSubject,
	mapToolToLogicalPermission,
} from "../agent-permissions.js";
import type {
	Artifact,
	ConversionJob,
	ConversionServiceConfig,
} from "../conversion-service-client.js";
import {
	CONVERSION_TOOL_NAMES,
	createConversionToolExecutors,
} from "../conversion-tools.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

const config: ConversionServiceConfig = {
	baseUrl: "https://converter.example/v1",
	apiKey: "test-key",
	callbackToken: "",
};

const inlineArtifactBuffer = (artifact: Artifact) =>
	Buffer.from(artifact.content ?? "", "utf-8");

const firstTextContent = (result: { content: Array<{ type: string }> }) => {
	const content = result.content[0];
	if (!content || content.type !== "text" || !("text" in content)) {
		throw new Error("Expected a text tool result");
	}
	return content.text;
};

describe("conversion tools", () => {
	beforeEach(async () => {
		await fs.mkdir(WORKSPACE, { recursive: true });
		await fs.writeFile(path.join(WORKSPACE, "scan.png"), "image-bytes");
	});

	it("converts a workspace file through the Python converter and returns Markdown", async () => {
		const client = {
			createConversionWithFile: vi.fn(async () => ({
				jobId: "job-image",
				status: "succeeded" as const,
				task: "image.ocr" as const,
				createdAt: new Date().toISOString(),
				artifacts: [
					{
						artifactId: "md-1",
						name: "scan.md",
						mimeType: "text/markdown",
						size: 13,
						inline: true,
						content: "HELLO RIDGE",
					},
				],
			})),
			downloadArtifacts: vi.fn(async (job: ConversionJob) => (job.artifacts ?? []).map((artifact) => ({
				artifact,
				buffer: inlineArtifactBuffer(artifact),
			}))),
		};
		const executors = createConversionToolExecutors({
			workspaceDir: WORKSPACE,
			loadConfig: async () => config,
			createClient: () => client as never,
		});

		const result = await executors.convert_file_to_markdown({
			path: "scan.png",
		});

		expect(client.createConversionWithFile).toHaveBeenCalledWith(
			path.join(WORKSPACE, "scan.png"),
			expect.objectContaining({
				task: "image.ocr",
				preferredFormat: "markdown",
				waitMs: 30_000,
			}),
		);
		expect(firstTextContent(result)).toContain("HELLO RIDGE");
		expect(result.details).toMatchObject({
			task: "image.ocr",
			sourcePath: "scan.png",
			markdown: "HELLO RIDGE",
		});
	});

	it("rejects file paths outside the workspace", async () => {
		const executors = createConversionToolExecutors({
			workspaceDir: WORKSPACE,
			loadConfig: async () => config,
			createClient: () => ({}) as never,
		});

		await expect(
			executors.convert_file_to_markdown({ path: "../secret.png" }),
		).rejects.toThrow("outside the allowed workspace root");
	});
});

describe("conversion tool permissions", () => {
	it("maps conversion tools to read permission", () => {
		for (const toolName of CONVERSION_TOOL_NAMES) {
			expect(mapToolToLogicalPermission(toolName)).toBe("read");
		}
	});

	it("uses source path as permission subject", () => {
		expect(extractPermissionSubject(WORKSPACE, "convert_file_to_markdown", { path: "scan.png" }))
			.toBe("scan.png");
	});

	it("uses source path as permission pattern", () => {
		expect(derivePermissionPattern(WORKSPACE, "convert_file_to_markdown", { path: "scan.png" }))
			.toBe("scan.png");
	});

	it("removes conversion tools when read is denied", () => {
		const policy = compileAgentPermission(WORKSPACE, { read: "deny" }, [
			"read",
			"convert_file_to_markdown",
		]);

		expect(policy.activeToolNames).not.toContain("read");
		expect(policy.activeToolNames).not.toContain("convert_file_to_markdown");
	});
});
