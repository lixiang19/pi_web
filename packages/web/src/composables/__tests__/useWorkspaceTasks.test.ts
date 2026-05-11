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

import { getWorkspaceMilestones, getWorkspaceTasks } from "@/lib/api";

const mockGetWorkspaceTasks = vi.mocked(getWorkspaceTasks);
const mockGetWorkspaceMilestones = vi.mocked(getWorkspaceMilestones);

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
		mockGetWorkspaceMilestones.mockResolvedValue({ milestones: [milestone] });
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

	it("passes projectFilter to getWorkspaceTasks on load", async () => {
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [] });

		const store = mountStore();

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalledWith(undefined);
		});

		store.projectFilter.value = "project-1";

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenLastCalledWith("project-1");
		});
	});
});
