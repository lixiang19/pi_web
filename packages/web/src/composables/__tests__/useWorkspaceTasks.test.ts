import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { useWorkspaceTasks } from "@/composables/useWorkspaceTasks";

vi.mock("vue-sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/api", () => ({
	createWorkspaceMilestone: vi.fn(),
	createWorkspaceTask: vi.fn(),
	deleteWorkspaceMilestone: vi.fn(),
	deleteWorkspaceTask: vi.fn(),
	getWorkspaceMilestones: vi.fn(),
	getWorkspaceTasks: vi.fn(),
	updateWorkspaceMilestone: vi.fn(),
	updateWorkspaceTask: vi.fn(),
}));

import { getWorkspaceMilestones, getWorkspaceTasks, createWorkspaceTask, updateWorkspaceTask, deleteWorkspaceTask, updateWorkspaceMilestone } from "@/lib/api";

const mockGetWorkspaceTasks = vi.mocked(getWorkspaceTasks);
const mockGetWorkspaceMilestones = vi.mocked(getWorkspaceMilestones);
const mockCreateWorkspaceTask = vi.mocked(createWorkspaceTask);
const mockUpdateWorkspaceTask = vi.mocked(updateWorkspaceTask);
const mockDeleteWorkspaceTask = vi.mocked(deleteWorkspaceTask);
const mockUpdateWorkspaceMilestone = vi.mocked(updateWorkspaceMilestone);

const mountStore = () => {
	let store: ReturnType<typeof useWorkspaceTasks> | undefined;
	mount(
		defineComponent({
			setup() {
				store = useWorkspaceTasks(() => "/workspace");
				return () => null;
			},
		}),
	);
	return store!;
};

const milestone = {
	id: "milestone-1",
	workspacePath: "/workspace",
	projectId: null,
	title: "M1",
	goal: "目标",
	acceptanceCriteria: "验收",
	status: "pending" as const,
	dueDate: null,
	isSystem: false,
	color: "#64748b",
	sortOrder: 0,
	createdAt: 1,
	updatedAt: 1,
	taskCount: 2,
};

	describe("useWorkspaceTasks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetAllMocks();
		mockGetWorkspaceMilestones.mockResolvedValue({ milestones: [milestone] });
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [] });
		mockCreateWorkspaceTask.mockRejectedValue(new Error("未设置 mockCreateWorkspaceTask"));
		mockUpdateWorkspaceTask.mockRejectedValue(new Error("未设置 mockUpdateWorkspaceTask"));
		mockDeleteWorkspaceTask.mockRejectedValue(new Error("未设置 mockDeleteWorkspaceTask"));
		mockUpdateWorkspaceMilestone.mockRejectedValue(new Error("未设置 mockUpdateWorkspaceMilestone"));
	});

	it("loads DB tasks and groups them by milestone", async () => {
		mockGetWorkspaceTasks.mockResolvedValue({
			tasks: [
				{
					id: "task-1",
					workspacePath: "/workspace",
					projectId: null,
					milestoneId: "milestone-1",
					title: "普通任务",
					status: "pending",
					priority: "normal",
					acceptanceCriteria: "完成标准",
					dueDate: null,
					blockedReason: null,
					processingSessionId: null,
					sortOrder: 0,
					createdAt: 2,
					updatedAt: 2,
				},
			],
		});

		const store = mountStore();

		await vi.waitFor(() => {
			expect(store.tasks.value).toHaveLength(1);
		});

		expect(store.tasksByMilestone.value[0]!.milestone.title).toBe("M1");
		expect(store.tasksByMilestone.value[0]!.tasks[0]!.title).toBe("普通任务");
	});

	it("updateTask returns success=true and updates local task on success", async () => {
		const updated = {
			id: "task-1",
			workspacePath: "/workspace",
			projectId: null,
			milestoneId: "milestone-1",
			title: "已更新",
			status: "in_progress" as const,
			priority: "normal" as const,
			acceptanceCriteria: "标准",
			dueDate: null,
			blockedReason: null,
			processingSessionId: null,
			sortOrder: 0,
			createdAt: 2,
			updatedAt: 3,
		};
		mockGetWorkspaceTasks
			.mockResolvedValueOnce({
				tasks: [
					{
						id: "task-1",
						workspacePath: "/workspace",
						projectId: null,
						milestoneId: "milestone-1",
						title: "普通任务",
						status: "pending" as const,
						priority: "normal" as const,
						acceptanceCriteria: "完成标准",
						dueDate: null,
						blockedReason: null,
						processingSessionId: null,
						sortOrder: 0,
						createdAt: 2,
						updatedAt: 2,
					},
				],
			})
			.mockResolvedValueOnce({ tasks: [updated] });
		mockUpdateWorkspaceTask.mockResolvedValue({ task: updated });

		const store = mountStore();
		await vi.waitFor(() => expect(store.tasks.value).toHaveLength(1));

		const result = await store.updateTask("task-1", { status: "in_progress", actor: "user" });
		expect(result).toEqual({ success: true, task: updated });
		expect(store.tasks.value[0]!.status).toBe("in_progress");
		expect(store.tasks.value[0]!.title).toBe("已更新");
	});

	it("updateTask returns success=false and rolls back on failure", async () => {
		mockGetWorkspaceTasks.mockResolvedValue({
			tasks: [
				{
					id: "task-1",
					workspacePath: "/workspace",
					projectId: null,
					milestoneId: "milestone-1",
					title: "普通任务",
					status: "pending" as const,
					priority: "normal" as const,
					acceptanceCriteria: "完成标准",
					dueDate: null,
					blockedReason: null,
					processingSessionId: null,
					sortOrder: 0,
					createdAt: 2,
					updatedAt: 2,
				},
			],
		});
		mockUpdateWorkspaceTask.mockRejectedValue(new Error("非法状态流转"));

		const store = mountStore();
		await vi.waitFor(() => expect(store.tasks.value).toHaveLength(1));

		const result = await store.updateTask("task-1", { status: "completed", actor: "user" });
		expect(result).toEqual({ success: false, error: "非法状态流转" });
		expect(store.tasks.value[0]!.status).toBe("pending");
	});

	it("addTask returns success=false and does not clear form fields on failure", async () => {
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [] });
		mockCreateWorkspaceTask.mockRejectedValue(new Error("标题不能为空"));

		const store = mountStore();
		await vi.waitFor(() => expect(store.tasks.value).toHaveLength(0));

		const result = await store.addTask({
			title: "失败任务",
			priority: "normal",
			acceptanceCriteria: "标准",
		});
		expect(result).toEqual({ success: false, error: "标题不能为空" });
		expect(store.tasks.value).toHaveLength(0);
	});

	it("deleteTask returns success=false and restores local tasks on failure", async () => {
		mockGetWorkspaceTasks.mockResolvedValue({
			tasks: [
				{
					id: "task-1",
					workspacePath: "/workspace",
					projectId: null,
					milestoneId: "milestone-1",
					title: "普通任务",
					status: "pending" as const,
					priority: "normal" as const,
					acceptanceCriteria: "完成标准",
					dueDate: null,
					blockedReason: null,
					processingSessionId: null,
					sortOrder: 0,
					createdAt: 2,
					updatedAt: 2,
				},
			],
		});
		mockDeleteWorkspaceTask.mockRejectedValue(new Error("删除失败"));

		const store = mountStore();
		await vi.waitFor(() => expect(store.tasks.value).toHaveLength(1));

		const result = await store.removeTask("task-1");
		expect(result).toEqual({ success: false, error: "删除失败" });
		expect(store.tasks.value).toHaveLength(1);
	});

	it("updateMilestone returns success=true and updates local milestone", async () => {
		const updated = { ...milestone, title: "已更新", status: "in_progress" as const, updatedAt: 3 };
		mockUpdateWorkspaceMilestone.mockResolvedValue({ milestone: updated });

		const store = mountStore();
		await vi.waitFor(() => expect(store.milestones.value).toHaveLength(1));

		const result = await store.updateMilestone("milestone-1", { status: "in_progress", actor: "user" });
		expect(result).toEqual({ success: true, milestone: updated });
		expect(store.milestones.value[0]!.status).toBe("in_progress");
	});
});
