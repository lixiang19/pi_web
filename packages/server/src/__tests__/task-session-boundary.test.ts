import { describe, expect, it } from "vitest";

import {
	assertTaskSessionAgentBoundary,
	TASK_SESSION_AGENT_NAME,
} from "../task-session-boundary.js";

describe("task session agent boundary", () => {
	it("allows task sessions to keep task-agent", () => {
		expect(() =>
			assertTaskSessionAgentBoundary(true, TASK_SESSION_AGENT_NAME),
		).not.toThrow();
	});

	it("allows task sessions to omit agent and keep the existing task-agent", () => {
		expect(() =>
			assertTaskSessionAgentBoundary(true, undefined),
		).not.toThrow();
	});

	it("rejects task sessions switching to a normal agent or clearing the agent", () => {
		expect(() =>
			assertTaskSessionAgentBoundary(true, "general-agent"),
		).toThrow("任务处理会话只能使用 task-agent");
		expect(() => assertTaskSessionAgentBoundary(true, null)).toThrow(
			"任务处理会话只能使用 task-agent",
		);
	});

	it("does not restrict normal sessions", () => {
		expect(() =>
			assertTaskSessionAgentBoundary(false, "general-agent"),
		).not.toThrow();
		expect(() => assertTaskSessionAgentBoundary(false, null)).not.toThrow();
	});
});
