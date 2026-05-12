import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createMilestone,
	createTask,
	getTask,
	updateMilestone,
	updateTask,
	type TaskPriority,
	type TaskStatus,
} from "./task-system.js";

const normalizeStr = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const createToolError = (message: string): Error => new Error(message);

const rejectBatchInput = (input: Record<string, unknown>): void => {
	const keys = Object.keys(input);
	if (
		keys.some(
			(k) =>
				k.includes("tasks") ||
				k.includes("task_ids") ||
				k.includes("milestones") ||
				k.includes("milestone_ids"),
		)
	) {
		throw createToolError(
			"批量/隐式多任务输入不被支持。请逐项明确调用。",
		);
	}
	if (Array.isArray(input.task_id)) {
		throw createToolError("不接受 task_id 数组。请逐项明确调用。");
	}
	if (Array.isArray(input.milestone_id)) {
		throw createToolError("不接受 milestone_id 数组。请逐项明确调用。");
	}
};

const toTaskSummary = (
	task: Awaited<ReturnType<typeof createTask>>,
): Record<string, unknown> => ({
	id: task.id,
	title: task.title,
	status: task.status,
	milestoneId: task.milestoneId,
	projectId: task.projectId,
});

const toMilestoneSummary = (
	milestone: Awaited<ReturnType<typeof createMilestone>>,
): Record<string, unknown> => ({
	id: milestone.id,
	title: milestone.title,
	status: milestone.status,
	projectId: milestone.projectId,
});

export interface PlanningToolResult {
	content: Array<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
}

export const createPlanningToolExecutors = (
	workspaceDir: string,
): Record<string, (params: Record<string, unknown>) => Promise<PlanningToolResult>> => {
	return {
		async create_task(params: Record<string, unknown>) {
			rejectBatchInput(params);
			const title = normalizeStr(params.title);
			if (!title) throw createToolError("缺少 title 参数");
			const acceptanceCriteria = normalizeStr(params.acceptance_criteria);
			if (!acceptanceCriteria)
				throw createToolError("缺少 acceptance_criteria 参数");

			const priority = (normalizeStr(params.priority) ||
				"normal") as TaskPriority;
			const task = await createTask(workspaceDir, {
				title,
				priority,
				acceptanceCriteria,
				dueDate:
					typeof params.due_date === "number"
						? params.due_date
						: undefined,
				milestoneId: normalizeStr(params.milestone_id) || undefined,
				projectId:
					params.project_id !== undefined
						? (params.project_id as string | null)
						: undefined,
			});

			return {
				content: [
					{
						type: "text" as const,
						text: `已创建任务：${task.title}（ID: ${task.id}）`,
					},
				],
				details: toTaskSummary(task),
			};
		},

		async update_task(params: Record<string, unknown>) {
			rejectBatchInput(params);
			const taskId = normalizeStr(params.task_id);
			if (!taskId) throw createToolError("缺少 task_id 参数");

			const status = normalizeStr(params.status) as TaskStatus | "";
			if (status === "completed") {
				throw createToolError(
					"Agent 不能将任务设为 completed。完成必须由用户人工确认。",
				);
			}

			const updateInput: Parameters<typeof updateTask>[2] = {
				actor: "agent",
			};
			if (params.title !== undefined)
				updateInput.title = normalizeStr(params.title);
			if (params.priority !== undefined)
				updateInput.priority = normalizeStr(
					params.priority,
				) as TaskPriority;
			if (params.acceptance_criteria !== undefined)
				updateInput.acceptanceCriteria = normalizeStr(
					params.acceptance_criteria,
				);
			if (params.due_date !== undefined)
				updateInput.dueDate = params.due_date as number | null;
			if (status) updateInput.status = status;
			if (params.blocked_reason !== undefined)
				updateInput.blockedReason = params.blocked_reason as
					| string
					| null;
			if (params.project_id !== undefined)
				updateInput.projectId = params.project_id as string | null;

			const task = await updateTask(workspaceDir, taskId, updateInput);
			return {
				content: [
					{
						type: "text" as const,
						text: `已更新任务：${task.title}（ID: ${task.id}）`,
					},
				],
				details: toTaskSummary(task),
			};
		},

		async create_milestone(params: Record<string, unknown>) {
			rejectBatchInput(params);
			const title = normalizeStr(params.title);
			if (!title) throw createToolError("缺少 title 参数");
			const goal = normalizeStr(params.goal);
			if (!goal) throw createToolError("缺少 goal 参数");
			const acceptanceCriteria = normalizeStr(
				params.acceptance_criteria,
			);
			if (!acceptanceCriteria)
				throw createToolError("缺少 acceptance_criteria 参数");

			const milestone = await createMilestone(workspaceDir, {
				title,
				goal,
				acceptanceCriteria,
				dueDate:
					typeof params.due_date === "number"
						? params.due_date
						: undefined,
				color: normalizeStr(params.color) || undefined,
				projectId:
					params.project_id !== undefined
						? (params.project_id as string | null)
						: undefined,
			});

			return {
				content: [
					{
						type: "text" as const,
						text: `已创建里程碑：${milestone.title}（ID: ${milestone.id}）`,
					},
				],
				details: toMilestoneSummary(milestone),
			};
		},

		async update_milestone(params: Record<string, unknown>) {
			rejectBatchInput(params);
			const milestoneId = normalizeStr(params.milestone_id);
			if (!milestoneId)
				throw createToolError("缺少 milestone_id 参数");

			const status = normalizeStr(params.status) as TaskStatus | "";
			if (status === "completed") {
				throw createToolError(
					"Agent 不能将里程碑设为 completed。完成必须由用户人工确认。",
				);
			}

			const updateInput: Parameters<typeof updateMilestone>[2] = {
				actor: "agent",
			};
			if (params.title !== undefined)
				updateInput.title = normalizeStr(params.title);
			if (params.goal !== undefined)
				updateInput.goal = normalizeStr(params.goal);
			if (params.acceptance_criteria !== undefined)
				updateInput.acceptanceCriteria = normalizeStr(
					params.acceptance_criteria,
				);
			if (params.due_date !== undefined)
				updateInput.dueDate = params.due_date as number | null;
			if (status) updateInput.status = status;
			if (params.color !== undefined)
				updateInput.color = normalizeStr(params.color);
			if (params.project_id !== undefined)
				updateInput.projectId = params.project_id as string | null;

			const milestone = await updateMilestone(
				workspaceDir,
				milestoneId,
				updateInput,
			);
			return {
				content: [
					{
						type: "text" as const,
						text: `已更新里程碑：${milestone.title}（ID: ${milestone.id}）`,
					},
				],
				details: toMilestoneSummary(milestone),
			};
		},

		async move_task(params: Record<string, unknown>) {
			rejectBatchInput(params);
			const taskId = normalizeStr(params.task_id);
			const milestoneId = normalizeStr(params.milestone_id);
			if (!taskId)
				throw createToolError("缺少 task_id 参数");
			if (!milestoneId)
				throw createToolError("缺少 milestone_id 参数");

			const task = await updateTask(workspaceDir, taskId, {
				milestoneId,
				actor: "agent",
			});
			return {
				content: [
					{
						type: "text" as const,
						text: `已将任务移动到里程碑 ${milestoneId}`,
					},
				],
				details: toTaskSummary(task),
			};
		},

		async set_blocked(params: Record<string, unknown>) {
			rejectBatchInput(params);
			const taskId = normalizeStr(params.task_id);
			const blockedReason = normalizeStr(params.blocked_reason);
			if (!taskId)
				throw createToolError("缺少 task_id 参数");
			if (!blockedReason)
				throw createToolError(
					"缺少 blocked_reason 参数，必须提供明确的阻塞原因",
				);

			const current = await getTask(workspaceDir, taskId);
			if (current.status !== "in_progress") {
				throw createToolError(
					`任务当前为 ${current.status}，不能设为 blocked。只能从 in_progress 流转到 blocked。`,
				);
			}

			const task = await updateTask(workspaceDir, taskId, {
				status: "blocked",
				blockedReason,
				actor: "agent",
			});
			return {
				content: [
					{
						type: "text" as const,
						text: `任务已设为 blocked：${blockedReason}`,
					},
				],
				details: toTaskSummary(task),
			};
		},

		async set_reviewing(params: Record<string, unknown>) {
			rejectBatchInput(params);
			const taskId = normalizeStr(params.task_id);
			if (!taskId)
				throw createToolError("缺少 task_id 参数");

			const current = await getTask(workspaceDir, taskId);
			if (current.status !== "in_progress") {
				throw createToolError(
					`任务当前为 ${current.status}，不能设为 reviewing。只能从 in_progress 流转到 reviewing。`,
				);
			}

			const task = await updateTask(workspaceDir, taskId, {
				status: "reviewing",
				actor: "agent",
			});
			return {
				content: [
					{
						type: "text" as const,
						text: "任务已设为 reviewing，等待用户确认完成",
					},
				],
				details: toTaskSummary(task),
			};
		},
	};
};

const CreateTaskSchema = Type.Object({
	title: Type.String({ description: "任务标题" }),
	priority: Type.Optional(
		Type.Union(
			[
				Type.Literal("normal"),
				Type.Literal("important"),
				Type.Literal("urgent"),
			],
			{ description: "任务优先级，默认为 normal" },
		),
	),
	acceptance_criteria: Type.String({ description: "验收标准" }),
	due_date: Type.Optional(
		Type.Number({ description: "截止日期时间戳" }),
	),
	milestone_id: Type.Optional(
		Type.String({ description: "里程碑 ID，不指定则挂到默认里程碑" }),
	),
	project_id: Type.Optional(
		Type.Union([Type.String(), Type.Null()], {
			description: "项目 ID，不指定则继承里程碑项目",
		}),
	),
});

const UpdateTaskSchema = Type.Object({
	task_id: Type.String({ description: "任务 ID" }),
	title: Type.Optional(Type.String()),
	priority: Type.Optional(
		Type.Union([
			Type.Literal("normal"),
			Type.Literal("important"),
			Type.Literal("urgent"),
		]),
	),
	acceptance_criteria: Type.Optional(Type.String()),
	due_date: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
	status: Type.Optional(
		Type.Union(
			[
				Type.Literal("pending"),
				Type.Literal("in_progress"),
				Type.Literal("blocked"),
				Type.Literal("reviewing"),
			],
			{ description: "新状态（不能设为 completed）" },
		),
	),
	blocked_reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
	project_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const CreateMilestoneSchema = Type.Object({
	title: Type.String({ description: "里程碑标题" }),
	goal: Type.String({ description: "目标" }),
	acceptance_criteria: Type.String({ description: "验收标准" }),
	due_date: Type.Optional(Type.Number()),
	color: Type.Optional(Type.String()),
	project_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const UpdateMilestoneSchema = Type.Object({
	milestone_id: Type.String({ description: "里程碑 ID" }),
	title: Type.Optional(Type.String()),
	goal: Type.Optional(Type.String()),
	acceptance_criteria: Type.Optional(Type.String()),
	due_date: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
	status: Type.Optional(
		Type.Union(
			[
				Type.Literal("pending"),
				Type.Literal("in_progress"),
				Type.Literal("blocked"),
				Type.Literal("reviewing"),
			],
			{ description: "新状态（不能设为 completed）" },
		),
	),
	color: Type.Optional(Type.String()),
	project_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const MoveTaskSchema = Type.Object({
	task_id: Type.String({ description: "任务 ID" }),
	milestone_id: Type.String({ description: "目标里程碑 ID" }),
});

const SetBlockedSchema = Type.Object({
	task_id: Type.String({ description: "任务 ID" }),
	blocked_reason: Type.String({ description: "阻塞原因，必须明确" }),
});

const SetReviewingSchema = Type.Object({
	task_id: Type.String({ description: "任务 ID" }),
});

export const PLANNING_TOOL_NAMES = [
	"create_task",
	"update_task",
	"create_milestone",
	"update_milestone",
	"move_task",
	"set_blocked",
	"set_reviewing",
] as const;

export const createPlanningToolsExtension =
	(workspaceDir: string) =>
	(pi: ExtensionAPI): void => {
		const executors = createPlanningToolExecutors(workspaceDir);

		pi.registerTool({
			name: "create_task",
			label: "Create Task",
			description:
				"创建单个正式任务。必须指定 milestone_id 或挂到默认里程碑。",
			parameters: CreateTaskSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.create_task(params);
			},
		});

		pi.registerTool({
			name: "update_task",
			label: "Update Task",
			description:
				"更新单个任务。task_id 必填，不接受批量。status 不能设为 completed。",
			parameters: UpdateTaskSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.update_task(params);
			},
		});

		pi.registerTool({
			name: "create_milestone",
			label: "Create Milestone",
			description: "创建单个里程碑。",
			parameters: CreateMilestoneSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.create_milestone(params);
			},
		});

		pi.registerTool({
			name: "update_milestone",
			label: "Update Milestone",
			description:
				"更新单个里程碑。status 不能设为 completed。",
			parameters: UpdateMilestoneSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.update_milestone(params);
			},
		});

		pi.registerTool({
			name: "move_task",
			label: "Move Task",
			description: "将单个任务移动到指定里程碑。",
			parameters: MoveTaskSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.move_task(params);
			},
		});

		pi.registerTool({
			name: "set_blocked",
			label: "Set Blocked",
			description:
				"将单个任务设为 blocked，必须提供明确的 blocked_reason。",
			parameters: SetBlockedSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.set_blocked(params);
			},
		});

		pi.registerTool({
			name: "set_reviewing",
			label: "Set Reviewing",
			description: "将单个任务设为 reviewing。",
			parameters: SetReviewingSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				return executors.set_reviewing(params);
			},
		});
	};
