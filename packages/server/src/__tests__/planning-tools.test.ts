import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getRidgeDb } from "../db/index.js";
import {
	createPlanningToolExecutors,
	PLANNING_TOOL_NAMES,
} from "../planning-tools.js";
import {
	compileAgentPermission,
	extractPermissionSubject,
	derivePermissionPattern,
	mapToolToLogicalPermission,
} from "../agent-permissions.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

let executors: ReturnType<typeof createPlanningToolExecutors>;

beforeEach(async () => {
	await fs.mkdir(WORKSPACE, { recursive: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM workspace_tasks").run();
	db.prepare("DELETE FROM workspace_milestones").run();
	executors = createPlanningToolExecutors(WORKSPACE);
});

describe("planning tools", () => {
	describe("create_task", () => {
		it("creates a task and returns essential fields", async () => {
			const result = await executors.create_task({
				title: "规划工具测试任务",
				acceptance_criteria: "验证返回字段完整",
			});

			expect(result.content[0].text).toContain("规划工具测试任务");
			expect(result.details).toHaveProperty("id");
			expect(result.details).toHaveProperty("title", "规划工具测试任务");
			expect(result.details).toHaveProperty("status", "pending");
			expect(result.details).toHaveProperty("milestoneId");
			expect(result.details).toHaveProperty("projectId");
		});

		it("rejects batch input with tasks array", async () => {
			await expect(
				executors.create_task({
					tasks: [{ title: "批量任务" }],
				}),
			).rejects.toThrow("批量/隐式多任务输入不被支持");
		});

		it("requires acceptance_criteria", async () => {
			await expect(
				executors.create_task({
					title: "无验收标准任务",
				}),
			).rejects.toThrow("缺少 acceptance_criteria 参数");
		});
	});

	describe("create_milestone", () => {
		it("creates a milestone and returns essential fields", async () => {
			const result = await executors.create_milestone({
				title: "规划里程碑",
				goal: "验证里程碑返回",
				acceptance_criteria: "包含必要字段",
			});

			expect(result.content[0].text).toContain("规划里程碑");
			expect(result.details).toHaveProperty("id");
			expect(result.details).toHaveProperty("title", "规划里程碑");
			expect(result.details).toHaveProperty("status", "pending");
			expect(result.details).toHaveProperty("projectId");
		});

		it("rejects batch input with milestones array", async () => {
			await expect(
				executors.create_milestone({
					milestones: [{ title: "批量里程碑" }],
				}),
			).rejects.toThrow("批量/隐式多任务输入不被支持");
		});
	});

	describe("update_task completed rejection", () => {
		it("explicitly rejects status=completed with human-confirm message", async () => {
			const created = await executors.create_task({
				title: "不能完成的任务",
				acceptance_criteria: "验证完成拒绝",
			});
			const taskId = created.details.id as string;

			await executors.update_task({
				task_id: taskId,
				status: "in_progress",
			});
			await executors.update_task({
				task_id: taskId,
				status: "reviewing",
			});

			await expect(
				executors.update_task({
					task_id: taskId,
					status: "completed",
				}),
			).rejects.toThrow("Agent 不能将任务设为 completed。完成必须由用户人工确认。");
		});

		it("rejects batch update with task_ids", async () => {
			await expect(
				executors.update_task({
					task_ids: ["task-1", "task-2"],
				}),
			).rejects.toThrow("批量/隐式多任务输入不被支持");
		});
	});

	describe("update_milestone completed rejection", () => {
		it("explicitly rejects status=completed", async () => {
			const created = await executors.create_milestone({
				title: "不能完成的里程碑",
				goal: "验证完成拒绝",
				acceptance_criteria: "Agent 不能完成",
			});
			const milestoneId = created.details.id as string;

			await executors.update_milestone({
				milestone_id: milestoneId,
				status: "in_progress",
			});
			await executors.update_milestone({
				milestone_id: milestoneId,
				status: "reviewing",
			});

			await expect(
				executors.update_milestone({
					milestone_id: milestoneId,
					status: "completed",
				}),
			).rejects.toThrow(
				"Agent 不能将里程碑设为 completed。完成必须由用户人工确认。",
			);
		});

		it("rejects batch update with milestone_ids", async () => {
			await expect(
				executors.update_milestone({
					milestone_ids: ["m-1", "m-2"],
				}),
			).rejects.toThrow("批量/隐式多任务输入不被支持");
		});
	});

	describe("move_task", () => {
		it("moves a task to a different milestone", async () => {
			const milestone = await executors.create_milestone({
				title: "目标里程碑",
				goal: "移动目标",
				acceptance_criteria: "接收任务",
			});
			const milestoneId = milestone.details.id as string;

			const task = await executors.create_task({
				title: "移动任务",
				acceptance_criteria: "验证移动",
			});
			const originalMilestoneId = task.details.milestoneId as string;
			const taskId = task.details.id as string;

			const moved = await executors.move_task({
				task_id: taskId,
				milestone_id: milestoneId,
			});

			expect(moved.details.milestoneId).toBe(milestoneId);
			expect(moved.details.milestoneId).not.toBe(originalMilestoneId);
		});

		it("rejects batch move", async () => {
			await expect(
				executors.move_task({
					task_ids: ["t1"],
					milestone_id: "m1",
				}),
			).rejects.toThrow("批量/隐式多任务输入不被支持");
		});
	});

	describe("set_blocked", () => {
		it("saves blocked_reason and sets status to blocked from in_progress", async () => {
			const task = await executors.create_task({
				title: "阻塞任务",
				acceptance_criteria: "验证阻塞",
			});
			const taskId = task.details.id as string;

			await executors.update_task({
				task_id: taskId,
				status: "in_progress",
			});

			const result = await executors.set_blocked({
				task_id: taskId,
				blocked_reason: "等待 API 文档",
			});

			expect(result.details.status).toBe("blocked");
		});

		it("rejects set_blocked from non-in_progress status", async () => {
			const task = await executors.create_task({
				title: "不能阻塞的任务",
				acceptance_criteria: "验证状态检查",
			});
			const taskId = task.details.id as string;

			await expect(
				executors.set_blocked({
					task_id: taskId,
					blocked_reason: "等待",
				}),
			).rejects.toThrow("不能设为 blocked。只能从 in_progress 流转到 blocked");
		});

		it("requires blocked_reason", async () => {
			const task = await executors.create_task({
				title: "无原因阻塞",
				acceptance_criteria: "验证原因必填",
			});
			const taskId = task.details.id as string;
			await executors.update_task({
				task_id: taskId,
				status: "in_progress",
			});

			await expect(
				executors.set_blocked({
					task_id: taskId,
				}),
			).rejects.toThrow("缺少 blocked_reason 参数");
		});
	});

	describe("set_reviewing", () => {
		it("sets status to reviewing from in_progress", async () => {
			const task = await executors.create_task({
				title: "审核任务",
				acceptance_criteria: "验证审核",
			});
			const taskId = task.details.id as string;

			await executors.update_task({
				task_id: taskId,
				status: "in_progress",
			});

			const result = await executors.set_reviewing({
				task_id: taskId,
			});

			expect(result.details.status).toBe("reviewing");
		});

		it("rejects set_reviewing from non-in_progress status", async () => {
			const task = await executors.create_task({
				title: "不能审核的任务",
				acceptance_criteria: "验证状态检查",
			});
			const taskId = task.details.id as string;

			await expect(
				executors.set_reviewing({
					task_id: taskId,
				}),
			).rejects.toThrow("不能设为 reviewing。只能从 in_progress 流转到 reviewing");
		});
	});

	describe("batch input rejection across all tools", () => {
		it("rejects tasks key on update_task", async () => {
			await expect(
				executors.update_task({
					tasks: [{ task_id: "t1", status: "completed" }],
				}),
			).rejects.toThrow("批量/隐式多任务输入不被支持");
		});

		it("rejects task_id array on update_task", async () => {
			await expect(
				executors.update_task({
					task_id: ["t1", "t2"],
				}),
			).rejects.toThrow("不接受 task_id 数组");
		});
	});
});

describe("planning tool permissions", () => {
	it("maps all 7 planning tools to task logical permission", () => {
		for (const toolName of PLANNING_TOOL_NAMES) {
			expect(mapToolToLogicalPermission(toolName)).toBe("task");
		}
	});

	it("returns tool name as subject for permission extraction", () => {
		for (const toolName of PLANNING_TOOL_NAMES) {
			const subject = extractPermissionSubject(
				"/workspace",
				toolName,
				{ task_id: "t1" },
			);
			expect(subject).toBe(toolName);
		}
	});

	it("returns tool name as pattern for permission derivation", () => {
		for (const toolName of PLANNING_TOOL_NAMES) {
			const pattern = derivePermissionPattern(
				"/workspace",
				toolName,
				{ task_id: "t1" },
			);
			expect(pattern).toBe(toolName);
		}
	});

	it("removes planning tools when task: deny", () => {
		const available = [
			"read",
			"edit",
			"task",
			"create_task",
			"update_task",
			"create_milestone",
			"update_milestone",
			"move_task",
			"set_blocked",
			"set_reviewing",
		];
		const policy = compileAgentPermission("/workspace", { task: "deny" }, available);

		expect(policy.activeToolNames).toContain("read");
		expect(policy.activeToolNames).toContain("edit");
		expect(policy.activeToolNames).not.toContain("task");
		expect(policy.activeToolNames).not.toContain("create_task");
		expect(policy.activeToolNames).not.toContain("update_task");
		expect(policy.activeToolNames).not.toContain("create_milestone");
		expect(policy.activeToolNames).not.toContain("update_milestone");
		expect(policy.activeToolNames).not.toContain("move_task");
		expect(policy.activeToolNames).not.toContain("set_blocked");
		expect(policy.activeToolNames).not.toContain("set_reviewing");
	});

	it("keeps planning tools when no permission config (default allow)", () => {
		const available = [
			"read",
			"create_task",
			"update_task",
		];
		const policy = compileAgentPermission("/workspace", undefined, available);

		expect(policy.activeToolNames).toContain("create_task");
		expect(policy.activeToolNames).toContain("update_task");
	});

	it("keeps planning tools when task: ask", () => {
		const available = ["create_task", "update_task"];
		const policy = compileAgentPermission("/workspace", { task: "ask" }, available);

		expect(policy.activeToolNames).toContain("create_task");
		expect(policy.activeToolNames).toContain("update_task");
	});
});
