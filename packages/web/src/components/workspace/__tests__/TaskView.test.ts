import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskView from "@/components/workspace/TaskView.vue";
import type { MilestoneItem, TaskItem } from "@/composables/useWorkspaceTasks";

const updateTask = vi.fn();

const milestones = ref<MilestoneItem[]>([
	{
		id: "milestone-1",
		workspacePath: "/workspace",
		title: "M1",
		goal: "目标",
		acceptanceCriteria: "验收",
		status: "pending",
		dueDate: null,
		isSystem: false,
		color: "#ef4444",
		sortOrder: 0,
		createdAt: 1,
		updatedAt: 1,
		taskCount: 1,
	},
]);

const tasks = ref<TaskItem[]>([
	{
		id: "task-1",
		workspacePath: "/workspace",
		milestoneId: "milestone-1",
		title: "任务一",
		status: "pending",
		priority: "urgent",
		acceptanceCriteria: "完成标准",
		dueDate: null,
		blockedReason: null,
		processingSessionId: null,
		sortOrder: 10,
		createdAt: 1,
		updatedAt: 1,
	},
]);

vi.mock("@/composables/useWorkspaceTasks", () => ({
	useWorkspaceTasks: () => ({
		milestones,
		stats: computed(() => ({
			pending: 1,
			inProgress: 0,
			blocked: 0,
			reviewing: 0,
			done: 0,
			total: 1,
		})),
		tasksByStatus: computed(() => ({
			pending: tasks.value.filter((task) => task.status === "pending"),
			in_progress: tasks.value.filter((task) => task.status === "in_progress"),
			blocked: [],
			reviewing: [],
			completed: [],
		})),
		tasksByMilestone: computed(() => [
			{ milestone: milestones.value[0], tasks: tasks.value },
		]),
		isLoading: ref(false),
		addTask: vi.fn(),
		addMilestone: vi.fn(),
		removeTask: vi.fn(),
		updateTask,
		updateMilestone: vi.fn(),
		removeMilestone: vi.fn(),
	}),
}));

const mountTaskView = () =>
	mount(TaskView, {
		props: { workspaceDir: "/workspace" },
		global: {
			stubs: {
				Button: { template: "<button v-bind='$attrs'><slot /></button>" },
				Input: { template: "<input v-bind='$attrs' />" },
				Textarea: { template: "<textarea v-bind='$attrs' />" },
				Select: { template: "<div><slot /></div>" },
				SelectContent: { template: "<div><slot /></div>" },
				SelectItem: { template: "<div><slot /></div>" },
				SelectTrigger: { template: "<button><slot /></button>" },
				SelectValue: true,
				Tabs: { template: "<div><slot /></div>" },
				TabsContent: { template: "<div><slot /></div>" },
				TabsList: { template: "<div><slot /></div>" },
				TabsTrigger: { template: "<button><slot /></button>" },
				Sheet: { template: "<div><slot /></div>" },
				SheetContent: { template: "<div><slot /></div>" },
				SheetHeader: { template: "<div><slot /></div>" },
				SheetTitle: { template: "<h3><slot /></h3>" },
				AlertDialog: { template: "<div><slot /></div>" },
				AlertDialogAction: { template: "<button><slot /></button>" },
				AlertDialogCancel: { template: "<button><slot /></button>" },
				AlertDialogContent: { template: "<div><slot /></div>" },
				AlertDialogDescription: { template: "<p><slot /></p>" },
				AlertDialogFooter: { template: "<div><slot /></div>" },
				AlertDialogHeader: { template: "<div><slot /></div>" },
				AlertDialogTitle: { template: "<h2><slot /></h2>" },
			},
		},
	});

describe("TaskView", () => {
	beforeEach(() => {
		updateTask.mockClear();
	});

	it("renders milestone filter and hides Agent entry", () => {
		const wrapper = mountTaskView();

		expect(wrapper.text()).toContain("里程碑筛选");
		expect(wrapper.text()).toContain("M1");
		expect(wrapper.text()).not.toContain("Agent 处理");
	});

	it("updates task status when dropped into a valid kanban column", async () => {
		const wrapper = mountTaskView();
		const card = wrapper.find("button[draggable='true']");
		await card.trigger("dragstart");

		const columns = wrapper.findAll("section");
		await columns[1]!.trigger("drop");

		expect(updateTask).toHaveBeenCalledWith(
			"task-1",
			expect.objectContaining({ status: "in_progress", actor: "user" }),
		);
	});
});
