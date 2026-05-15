import type { HttpError } from "./types/index.js";

export const TASK_SESSION_AGENT_NAME = "task-agent";

export function assertTaskSessionAgentBoundary(
	isTaskSession: boolean,
	requestedAgent: string | null | undefined,
): void {
	if (!isTaskSession || requestedAgent === undefined) {
		return;
	}

	if (requestedAgent === TASK_SESSION_AGENT_NAME) {
		return;
	}

	const error = new Error(
		"任务处理会话只能使用 task-agent，不能切换到普通 Agent",
	) as HttpError;
	error.statusCode = 400;
	throw error;
}
