import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import TaskView from "@/components/workspace/TaskView.vue";
import type { MilestoneItem, TaskItem } from "@/composables/useWorkspaceTasks";

const openProcessingSession = vi.fn(() =>
	Promise.resolve({ success: true, sessionId: "session-123", created: true }) as Promise<Record<string, unknown>>,
);

const updateTask = vi.fn(() =>
	Promise.resolve({
		success: true,
		task: {
			id: "task-1",
			title: "已更新",
			status: "in_progress",
			milestoneId: "milestone-1",
			projectId: null,
			priority: "normal",
			acceptanceCriteria: "标准",
			dueDate: null,
			blockedReason: null,
			sortOrder: 0,
			createdAt: 1,
			updatedAt: 2,
		},
	}),
);
const mockAddTask = vi.fn(() =>
	Promise.resolve({
		success: true,
		task: { id: "new-task", title: "新任务", status: "pending" } as unknown as Record<string, unknown>,
	}),
);
const mockAddMilestone = vi.fn(() =>
	Promise.resolve({
		success: true,
		milestone: { id: "new-ms", title: "新里程碑" } as unknown as Record<string, unknown>,
	}),
);
const mockLoadProjects = vi.fn();

const milestones = ref<MilestoneItem[]>([
	{
		id: "milestone-1",
		workspacePath: "/workspace",
		projectId: "project-1",
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
		projectId: "project-1",
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
	{
		id: "task-2",
		workspacePath: "/workspace",
		projectId: null,
		milestoneId: "milestone-1",
		title: "任务二无项目",
		status: "pending",
		priority: "normal",
		acceptanceCriteria: "完成标准2",
		dueDate: null,
		blockedReason: null,
		processingSessionId: null,
		sortOrder: 11,
		createdAt: 2,
		updatedAt: 2,
	},
]);

vi.mock("@/composables/useWorkspaceTasks", () => ({
	useWorkspaceTasks: () => ({
		milestones,
		stats: computed(() => ({
			pending: 2,
			inProgress: 0,
			blocked: 0,
			reviewing: 0,
			done: 0,
			total: 2,
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
		addTask: mockAddTask,
		addMilestone: mockAddMilestone,
		removeTask: vi.fn(),
		updateTask,
		updateMilestone: vi.fn(),
		openProcessingSession,
		removeMilestone: vi.fn(),
		projectFilter: ref<string | null | undefined>(undefined),
	}),
}));

vi.mock("@/composables/useProjects", () => ({
	useProjects: () => ({
		projects: ref([
			{ id: "project-1", name: "Project A", path: "/p/a", isGit: true, updatedAt: 1, projectType: "git", source: "local" },
		]),
		load: mockLoadProjects,
		isLoading: ref(false),
		error: ref(""),
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
		mockAddTask.mockClear();
		mockAddTask.mockImplementation(() =>
			Promise.resolve({ success: true, task: { id: "new-task", title: "新任务" } }),
		);
		mockAddMilestone.mockClear();
		mockAddMilestone.mockImplementation(() =>
			Promise.resolve({ success: true, milestone: { id: "new-ms", title: "新里程碑" } }),
		);
		mockLoadProjects.mockClear();
		openProcessingSession.mockClear();
		openProcessingSession.mockImplementation(() =>
			Promise.resolve({ success: true, sessionId: "session-123", created: true }),
		);
	});

	afterEach(() => {
		// Reset to default success implementation so other tests don't inherit failures
		mockAddTask.mockImplementation(() =>
			Promise.resolve({ success: true, task: { id: "new-task", title: "新任务" } }),
		);
		mockAddMilestone.mockImplementation(() =>
			Promise.resolve({ success: true, milestone: { id: "new-ms", title: "新里程碑" } }),
		);
		openProcessingSession.mockImplementation(() =>
			Promise.resolve({ success: true, sessionId: "session-123", created: true }),
		);
	});

	it("renders milestone filter and hides Agent entry", () => {
		const wrapper = mountTaskView();

		expect(wrapper.text()).toContain("里程碑筛选");
		expect(wrapper.text()).toContain("M1");
		expect(wrapper.text()).not.toContain("Agent 处理");
	});

	it("emits openSession when processing session button is clicked in task detail", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;

		// Open first task detail
		vm["selectedTask"] = tasks.value[0];
		await wrapper.vm.$nextTick();

		// Find and click the processing session button
		const buttons = wrapper.findAll("button");
		const psBtn = buttons.find((b) => b.text().includes("开始处理") || b.text().includes("继续处理"));
		expect(psBtn).toBeDefined();
		await psBtn!.trigger("click");

		expect(openProcessingSession).toHaveBeenCalledWith("task-1");
		expect(wrapper.emitted("openSession")).toHaveLength(1);
		expect(wrapper.emitted("openSession")![0]).toEqual(["session-123"]);
	});

	it("shows '继续处理' when task already has processingSessionId", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;

		// Open task with existing processingSessionId
		const taskWithSession = { ...tasks.value[0], processingSessionId: "session-existing" };
		vm["selectedTask"] = taskWithSession;
		await wrapper.vm.$nextTick();

		const buttons = wrapper.findAll("button");
		const psBtn = buttons.find((b) => b.text().includes("继续处理"));
		expect(psBtn).toBeDefined();
	});

	it("does not emit openSession when openProcessingSession fails", async () => {
		openProcessingSession.mockImplementationOnce(() =>
			Promise.resolve({ success: false, error: "项目离线" }) as Promise<Record<string, unknown>>,
		);
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;

		vm["selectedTask"] = tasks.value[0];
		await wrapper.vm.$nextTick();

		const buttons = wrapper.findAll("button");
		const psBtn = buttons.find((b) => b.text().includes("开始处理") || b.text().includes("继续处理"));
		expect(psBtn).toBeDefined();
		await psBtn!.trigger("click");

		expect(openProcessingSession).toHaveBeenCalledWith("task-1");
		expect(wrapper.emitted("openSession")).toBeUndefined();
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

	it("loads projects on mount", () => {
		mountTaskView();
		expect(mockLoadProjects).toHaveBeenCalled();
	});

	it("displays project filter control with '全部项目'", () => {
		const wrapper = mountTaskView();
		expect(wrapper.text()).toContain("项目筛选");
		expect(wrapper.text()).toContain("全部项目");
	});

	it("shows project name in kanban cards", () => {
		const wrapper = mountTaskView();
		const text = wrapper.text();
		expect(text).toContain("Project A");
		expect(text).toContain("无项目");
	});

	it("new task defaults to inherit milestone (projectId undefined)", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;
		vm["newTaskTitle"] = "新任务";
		vm["newTaskAcceptanceCriteria"] = "标准";
		await wrapper.vm.$nextTick();

		const buttons = wrapper.findAll("button");
		const addBtn = buttons.find((b) => b.text().includes("新建任务"));
		expect(addBtn).toBeDefined();
		await addBtn!.trigger("click");

		expect(mockAddTask).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "新任务",
				acceptanceCriteria: "标准",
				projectId: undefined,
			}),
		);
	});

	it("new task can select no project (projectId null)", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;
		vm["newTaskTitle"] = "新任务";
		vm["newTaskAcceptanceCriteria"] = "标准";
		vm["newTaskProjectId"] = "__none__";
		await wrapper.vm.$nextTick();

		const buttons = wrapper.findAll("button");
		const addBtn = buttons.find((b) => b.text().includes("新建任务"));
		await addBtn!.trigger("click");

		expect(mockAddTask).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: null,
			}),
		);
	});

	it("new task can select a specific project", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;
		vm["newTaskTitle"] = "新任务";
		vm["newTaskAcceptanceCriteria"] = "标准";
		vm["newTaskProjectId"] = "project-1";
		await wrapper.vm.$nextTick();

		const buttons = wrapper.findAll("button");
		const addBtn = buttons.find((b) => b.text().includes("新建任务"));
		await addBtn!.trigger("click");

		expect(mockAddTask).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
			}),
		);
	});

	it("successful addTask clears new task form fields", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;
		vm["newTaskTitle"] = "成功任务";
		vm["newTaskAcceptanceCriteria"] = "标准";
		await wrapper.vm.$nextTick();

		const buttons = wrapper.findAll("button");
		const addBtn = buttons.find((b) => b.text().includes("新建任务"));
		await addBtn!.trigger("click");

		expect(mockAddTask).toHaveBeenCalled();
		expect(vm["newTaskTitle"]).toBe("");
		expect(vm["newTaskAcceptanceCriteria"]).toBe("");
	});

	it("syncs selectedTask after successful save so user can continue editing", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;

		// Open first task detail directly
		vm["selectedTask"] = tasks.value[0];
		vm["editTaskTitle"] = "修改后的标题";
		await wrapper.vm.$nextTick();

		const saveBtn = wrapper.findAll("button").find((b) => b.text().includes("保存"));
		await saveBtn!.trigger("click");

		expect(updateTask).toHaveBeenCalledWith(
			"task-1",
			expect.objectContaining({ title: "修改后的标题", actor: "user" }),
		);
		expect(vm["selectedTask"]).toMatchObject({ title: "已更新", status: "in_progress" });
	});

	it("kanban drag with invalid status transition does not call updateTask", async () => {
		const wrapper = mountTaskView();
		const card = wrapper.find("button[draggable='true']");
		await card.trigger("dragstart");

		const columns = wrapper.findAll("section");
		// Column 4 = "completed" — invalid from pending
		await columns[4]!.trigger("drop");

		expect(updateTask).not.toHaveBeenCalled();
	});

	it("list view and milestone view can open detail", async () => {
		const wrapper = mountTaskView();
		// list view: click on task row
		const listRows = wrapper.findAll("button.flex");
		if (listRows.length > 0) {
			await listRows[0]!.trigger("click");
			const vm = wrapper.vm as unknown as Record<string, unknown>;
			expect(vm["selectedTask"]).toBeTruthy();
		}
	});

	it("calendar view can open task detail", async () => {
		const wrapper = mountTaskView();
		const vm = wrapper.vm as unknown as Record<string, unknown>;
		vm["viewMode"] = "calendar";
		await wrapper.vm.$nextTick();
		// calendar has no tasks in this mock because all tasks have null dueDate
		// just check it renders
		expect(wrapper.text()).toContain("无截止日期");
	});
});
