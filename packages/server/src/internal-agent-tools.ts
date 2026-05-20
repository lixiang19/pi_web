import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { normalizeString } from "./utils/strings.js";

export const INTERNAL_TASK_COMPLETION_TOOL_NAME = "complete_internal_task";

export interface InternalTaskCompletionInput {
	status: "completed" | "failed";
	summary: string;
	error?: string;
}

export interface InternalTaskCompletionResult {
	agentName: string;
	status: "completed" | "failed";
	summary: string;
	error?: string;
	completedAt: number;
}

const completionToolSchema = Type.Object({
	status: Type.Union([Type.Literal("completed"), Type.Literal("failed")], {
		description: "内部任务结果",
	}),
	summary: Type.String({ description: "给用户和后台任务显示的处理摘要" }),
	error: Type.Optional(Type.String({ description: "失败错误信息" })),
});

export function normalizeInternalTaskCompletionInput(
	value: unknown,
): InternalTaskCompletionInput {
	if (!value || typeof value !== "object") {
		throw new Error(`${INTERNAL_TASK_COMPLETION_TOOL_NAME} input must be an object`);
	}
	const data = value as Record<string, unknown>;
	const status = normalizeString(data.status);
	const summary = normalizeString(data.summary);
	const error = normalizeString(data.error);
	if (status !== "completed" && status !== "failed") {
		throw new Error(`${INTERNAL_TASK_COMPLETION_TOOL_NAME} status must be completed or failed`);
	}
	if (!summary) {
		throw new Error(`${INTERNAL_TASK_COMPLETION_TOOL_NAME} requires summary`);
	}
	return {
		status,
		summary,
		error: error || undefined,
	};
}

export function createInternalTaskCompletionExtension(options: {
	agentName: string;
	onComplete: (input: InternalTaskCompletionInput) => Promise<InternalTaskCompletionResult> | InternalTaskCompletionResult;
}) {
	return (pi: ExtensionAPI): void => {
		pi.registerTool({
			name: INTERNAL_TASK_COMPLETION_TOOL_NAME,
			label: "Complete Internal Task",
			description: "Complete the current internal agent task with a short status summary.",
			parameters: completionToolSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				const result = await options.onComplete(normalizeInternalTaskCompletionInput(params));
				return {
					content: [
						{
							type: "text" as const,
							text: result.status === "completed"
								? "内部任务完成。"
								: `内部任务失败：${result.error || result.summary}`,
						},
					],
					details: result,
				};
			},
		});
	};
}
