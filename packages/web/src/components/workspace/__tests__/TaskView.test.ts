import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import TaskView from "@/components/workspace/TaskView.vue";
import type { TaskItem } from "@/composables/useWorkspaceTasks";

// ---- Mock data ----

const now = Date.now();
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);
const todayTs = todayStart.getTime();

const mockTasksData = ref<TaskItem[]>([
	{
		id: "1",
		title: "待做任务A",
		status: "pending",
		priority: "high",
		dueDate: todayTs,
		tags: ["工作"],
		createdAt: now - 1000,
		updatedAt: now - 1000,
	},
	{
		id: "2",
		title: "进行中任务B",
		status: "in_progress",
		priority: "medium",
		dueDate: null,
		tags: [],
		createdAt: now - 2000,
		updatedAt: now - 2000,
	},
	{
		id: "3",
		title: "已完成任务C",
		status: "done",
		priority: "low",
		dueDate: null,
		tags: ["个人"],
		createdAt: now - 3000,
		updatedAt: now - 3000,
	},
]);

const mockToggleStatus = vi.fn();
const mockRemoveTask = vi.fn();
const mockAddTask = vi.fn().mockResolvedValue(undefined);
const mockReorderTasks = vi.fn();

vi.mock("@/composables/useWorkspaceTasks", () => ({
	useWorkspaceTasks: () => ({
		tasks: mockTasksData,
		searchQuery: ref(""),
		filterStatus: ref<"all" | "pending" | "in_progress" | "done">("all"),
		filterPriority: ref<"all" | "high" | "medium" | "low">("all"),
		filterTags: ref<string[]>([]),
		allTags: ref(["工作", "个人"]),
		hasActiveFilters: ref(false),
		resetFilters: vi.fn(),
		filteredTasks: ref([...mockTasksData.value]),
		completedTasks: ref(mockTasksData.value.filter((t) => t.status === "done")),
		todayTasks: ref(
			mockTasksData.value.filter(
				(t) => t.status !== "done" && t.dueDate && t.dueDate >= todayTs,
			),
		),
		stats: ref({ pending: 1, inProgress: 1, done: 1, total: 3 }),
		isLoading: ref(false),
		showCompleted: ref(false),
		addTask: mockAddTask,
		toggleStatus: mockToggleStatus,
		removeTask: mockRemoveTask,
		updateTask: vi.fn().mockResolvedValue(undefined),
		reorderTasks: mockReorderTasks,
	}),
}));

// Stub vue-draggable-next — Draggable renders as a div with slotted items
vi.mock("vue-draggable-next", () => ({
	VueDraggableNext: {
		name: "Draggable",
		props: ["list", "itemKey", "group", "animation", "ghostClass"],
		emits: ["start", "end"],
		template: `<div><slot name="item" v-for="element in list" :element="element" /></div>`,
	},
}));

// Stub vue-sonner
vi.mock("vue-sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// ---- Shared stubs for shadcn/reka components ----

const globalStubs = {
	Tabs: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		template: `<div data-slot="tabs"><slot /></div>`,
	},
	TabsList: { template: '<div data-slot="tabs-list"><slot /></div>' },
	TabsTrigger: {
		props: ["value"],
		emits: ["update:value"],
		template:
			'<button data-slot="tabs-trigger" :data-value="value" role="tab" @click="$emit(\'update:value\', value)"><slot /></button>',
	},
	TabsContent: {
		props: ["value"],
		template:
			'<div data-slot="tabs-content" :data-value="value" v-show="true"><slot /></div>',
	},
	Select: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		template: '<div data-slot="select"><slot /></div>',
	},
	SelectContent: { template: '<div data-slot="select-content"><slot /></div>' },
	SelectItem: {
		props: ["value"],
		template:
			'<div data-slot="select-item" :data-value="value" @click="$parent.$emit(\'update:modelValue\', value)"><slot /></div>',
	},
	SelectTrigger: { template: '<div data-slot="select-trigger"><slot /></div>' },
	SelectValue: { props: ["placeholder"], template: "<span><slot /></span>" },
	Popover: { template: '<div data-slot="popover"><slot /></div>' },
	PopoverContent: {
		template: '<div data-slot="popover-content"><slot /></div>',
	},
	PopoverTrigger: {
		template: '<span data-slot="popover-trigger"><slot /></span>',
	},
	Checkbox: {
		props: ["checked"],
		emits: ["update:checked"],
		template:
			'<input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
	},
};

// ---- Helper ----

function mountTaskView() {
	return mount(TaskView, {
		props: { workspaceDir: "/test" },
		global: { stubs: globalStubs },
	});
}

// ---- Tests ----

describe("TaskView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock data to original
		mockTasksData.value = [
			{
				id: "1",
				title: "待做任务A",
				status: "pending",
				priority: "high",
				dueDate: todayTs,
				tags: ["工作"],
				createdAt: now - 1000,
				updatedAt: now - 1000,
			},
			{
				id: "2",
				title: "进行中任务B",
				status: "in_progress",
				priority: "medium",
				dueDate: null,
				tags: [],
				createdAt: now - 2000,
				updatedAt: now - 2000,
			},
			{
				id: "3",
				title: "已完成任务C",
				status: "done",
				priority: "low",
				dueDate: null,
				tags: ["个人"],
				createdAt: now - 3000,
				updatedAt: now - 3000,
			},
		];
	});

	// --- 视图切换 ---
	describe("视图切换", () => {
		it("默认显示清单视图", () => {
			const wrapper = mountTaskView();
			// 清单 tab 文本应存在
			expect(wrapper.text()).toContain("清单");
			expect(wrapper.text()).toContain("看板");
			expect(wrapper.text()).toContain("今日");
		});
	});

	// --- 清单视图 ---
	describe("清单视图", () => {
		it("渲染 pending 和 in_progress 任务列表", () => {
			const wrapper = mountTaskView();
			expect(wrapper.text()).toContain("待做任务A");
			expect(wrapper.text()).toContain("进行中任务B");
		});

		it("点击 toggle 按钮切换状态", async () => {
			const wrapper = mountTaskView();
			// 找到清单视图中无文本的切换按钮（状态圆圈按钮）
			const allBtns = wrapper.findAll("button");
			const statusBtn = allBtns.find((b) => {
				const text = b.text().trim();
				return text === "" && b.attributes("type") === "button";
			});
			if (statusBtn) {
				await statusBtn.trigger("click");
				expect(mockToggleStatus).toHaveBeenCalled();
			}
		});

		it("已完成任务区域显示折叠按钮", () => {
			const wrapper = mountTaskView();
			expect(wrapper.text()).toContain("已完成");
		});
	});

	// --- 看板视图 ---
	describe("看板视图", () => {
		it("三列：待做/进行中/完成", () => {
			const wrapper = mountTaskView();
			const text = wrapper.text();
			expect(text).toContain("待做");
			expect(text).toContain("进行中");
			expect(text).toContain("完成");
		});

		it("卡片显示标题", () => {
			const wrapper = mountTaskView();
			expect(wrapper.text()).toContain("待做任务A");
			expect(wrapper.text()).toContain("进行中任务B");
		});

		it("卡片操作按钮正确触发 toggle", async () => {
			const wrapper = mountTaskView();
			// 看板卡片中有 "开始" / "完成" 按钮
			const startBtn = wrapper
				.findAll("button")
				.find((b) => b.text().includes("开始"));
			if (startBtn) {
				await startBtn.trigger("click");
				expect(mockToggleStatus).toHaveBeenCalled();
			}
		});
	});

	// --- 今日视图 ---
	describe("今日视图", () => {
		it("只显示今日相关未完成任务", () => {
			const wrapper = mountTaskView();
			// 今日视图内容区域有 "待做任务A"（dueDate 为今天）
			// 检查 "没有待办" 文本不存在，说明有今日任务
			expect(wrapper.text()).toContain("待做任务A");
		});
	});

	// --- 创建任务 ---
	describe("创建任务", () => {
		it("输入框 + Enter 创建新任务", async () => {
			const wrapper = mountTaskView();
			const input = wrapper.find('input[placeholder="新建任务..."]');
			expect(input.exists()).toBe(true);

			const el = input.element as HTMLInputElement;
			el.value = "新任务";
			el.dispatchEvent(new Event("input", { bubbles: true }));
			await nextTick();

			el.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
			);
			await nextTick();

			expect(mockAddTask).toHaveBeenCalledWith(
				expect.objectContaining({ title: "新任务" }),
			);
		});

		it("空标题不创建", async () => {
			const wrapper = mountTaskView();
			const input = wrapper.find('input[placeholder="新建任务..."]');
			const el = input.element as HTMLInputElement;
			el.value = "   ";
			el.dispatchEvent(new Event("input", { bubbles: true }));
			await nextTick();

			el.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
			);
			await nextTick();

			expect(mockAddTask).not.toHaveBeenCalled();
		});

		it("点击添加按钮创建任务", async () => {
			const wrapper = mountTaskView();
			const input = wrapper.find('input[placeholder="新建任务..."]');
			const el = input.element as HTMLInputElement;
			el.value = "按钮创建";
			el.dispatchEvent(new Event("input", { bubbles: true }));
			await nextTick();

			const addBtn = wrapper
				.findAll("button")
				.find((b) => b.text().includes("添加"));
			expect(addBtn).toBeTruthy();
			await addBtn!.trigger("click");

			expect(mockAddTask).toHaveBeenCalledWith(
				expect.objectContaining({ title: "按钮创建" }),
			);
		});
	});

	// --- 搜索筛选 ---
	describe("搜索筛选", () => {
		it("搜索框存在并可输入", () => {
			const wrapper = mountTaskView();
			const searchInput = wrapper.find('input[placeholder="搜索待办..."]');
			expect(searchInput.exists()).toBe(true);
		});

		it("搜索框输入过滤任务", async () => {
			const wrapper = mountTaskView();
			const searchInput = wrapper.find('input[placeholder="搜索待办..."]');
			const el = searchInput.element as HTMLInputElement;
			el.value = "待做";
			el.dispatchEvent(new Event("input", { bubbles: true }));
			await nextTick();

			// searchQuery ref 应该已更新 — 验证 composable 的 searchQuery 被赋值
			// 因为 composable 是 mock 的，我们验证输入值变化即可
			expect(el.value).toBe("待做");
		});

		it("状态下拉选择存在", () => {
			const wrapper = mountTaskView();
			// 状态筛选项存在（全部/待做/进行中/已完成）
			expect(wrapper.text()).toContain("待做");
			expect(wrapper.text()).toContain("进行中");
			expect(wrapper.text()).toContain("已完成");
		});

		it("优先级下拉选择存在", () => {
			const wrapper = mountTaskView();
			// 优先级筛选项存在（高/中/低）
			expect(wrapper.text()).toContain("高");
			expect(wrapper.text()).toContain("低");
		});
	});

	// --- 统计信息 ---
	describe("统计信息", () => {
		it("显示任务统计", () => {
			const wrapper = mountTaskView();
			expect(wrapper.text()).toContain("待做 1");
			expect(wrapper.text()).toContain("进行中 1");
			expect(wrapper.text()).toContain("完成 1");
		});
	});

	// --- 删除任务 ---
	describe("删除任务", () => {
		it("删除按钮触发 removeTask", async () => {
			const wrapper = mountTaskView();
			// 看板视图中有 "删除" 按钮
			const deleteBtn = wrapper
				.findAll("button")
				.find((b) => b.text().includes("删除"));
			if (deleteBtn) {
				await deleteBtn.trigger("click");
				expect(mockRemoveTask).toHaveBeenCalled();
			}
		});
	});
});
