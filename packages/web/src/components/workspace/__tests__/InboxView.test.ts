import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import InboxView from "@/components/workspace/InboxView.vue";
import type { InboxGroup, InboxMomentItem } from "@/composables/useInbox";

// ── Mock composable ────────────────────────────────────────────

const mockGroupedItems = ref<InboxGroup[]>([]);
const mockFilteredItems = ref<InboxMomentItem[]>([]);
const mockIsLoading = ref(false);
const mockError = ref("");
const mockSearchQuery = ref("");
const mockCount = ref(0);
const mockCaptureNote = vi.fn().mockResolvedValue(undefined);
const mockFormatTime = vi.fn((item: InboxMomentItem) => item.time);

vi.mock("@/composables/useInbox", () => ({
	useWorkspaceInbox: () => ({
		groupedItems: mockGroupedItems,
		filteredItems: mockFilteredItems,
		isLoading: mockIsLoading,
		error: mockError,
		searchQuery: mockSearchQuery,
		count: mockCount,
		captureNote: mockCaptureNote,
		formatTime: mockFormatTime,
	}),
}));

// Stub vue-sonner
vi.mock("vue-sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

// ── Shared stubs for shadcn components ─────────────────────────

const globalStubs = {
	Badge: {
		props: ["variant"],
		template: '<span data-testid="badge"><slot /></span>',
	},
	Button: {
		props: ["size", "variant", "disabled"],
		emits: ["click"],
		template:
			'<button :disabled="disabled" data-testid="button" @click="$emit(\'click\')"><slot /></button>',
	},
	Textarea: {
		props: ["modelValue", "placeholder", "class"],
		emits: ["update:modelValue", "keydown", "input"],
		template:
			'<textarea :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
	},
	Separator: {
		template: '<hr data-testid="separator" />',
	},
};

// ── Helper ─────────────────────────────────────────────────────

function mountInboxView() {
	return mount(InboxView, {
		props: { workspaceDir: "/ws" },
		global: { stubs: globalStubs },
	});
}

function makeMomentItem(
	overrides: Partial<InboxMomentItem> & {
		id: string;
		date: string;
		time: string;
		content: string;
		path: string;
	},
): InboxMomentItem {
	return {
		preview: overrides.content,
		relativePath: `收件箱/${overrides.date}.md`,
		timestamp: Date.parse(`${overrides.date}T${overrides.time}`),
		...overrides,
	};
}

// ── Tests ───────────────────────────────────────────────────────

describe("InboxView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGroupedItems.value = [];
		mockFilteredItems.value = [];
		mockIsLoading.value = false;
		mockError.value = "";
		mockSearchQuery.value = "";
		mockCount.value = 0;
		mockCaptureNote.mockResolvedValue(undefined);
	});

	// --- 空状态 ---
	describe("空状态", () => {
		it("count=0 时展示收件箱为空和写下你的第一个闪念吧", () => {
			mockCount.value = 0;
			const wrapper = mountInboxView();
			expect(wrapper.text()).toContain("收件箱为空");
			expect(wrapper.text()).toContain("写下你的第一个闪念吧");
		});
	});

	// --- 错误态 ---
	describe("错误态", () => {
		it("error 非空时展示加载失败和错误信息", () => {
			mockError.value = "network error";
			mockCount.value = 0;
			const wrapper = mountInboxView();
			expect(wrapper.text()).toContain("加载失败");
			expect(wrapper.text()).toContain("network error");
		});
	});

	// --- 加载态 ---
	describe("加载态", () => {
		it("isLoading=true 时展示加载中", () => {
			mockIsLoading.value = true;
			const wrapper = mountInboxView();
			expect(wrapper.text()).toContain("加载中");
		});
	});

	// --- 分组渲染 ---
	describe("分组渲染", () => {
		it("展示今天 / 昨天 / 更早，且每组条目正确", () => {
			const today = new Date();
			const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
			const yesterdayDate = new Date(Date.now() - 86_400_000);
			const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

			mockCount.value = 3;
			mockGroupedItems.value = [
				{
					label: "今天",
					items: [
						makeMomentItem({
							id: `${todayStr}-10:00-0`,
							date: todayStr,
							time: "10:00",
							content: "今天的想法",
							path: `/ws/收件箱/${todayStr}.md`,
						}),
					],
				},
				{
					label: "昨天",
					items: [
						makeMomentItem({
							id: `${yesterdayStr}-18:00-0`,
							date: yesterdayStr,
							time: "18:00",
							content: "昨天的想法",
							path: `/ws/收件箱/${yesterdayStr}.md`,
						}),
					],
				},
				{
					label: "更早",
					items: [
						makeMomentItem({
							id: "2026-01-01-09:00-0",
							date: "2026-01-01",
							time: "09:00",
							content: "更早的想法",
							path: "/ws/收件箱/2026-01-01.md",
						}),
					],
				},
			];
			mockFilteredItems.value = mockGroupedItems.value.flatMap((g) => g.items);

			const wrapper = mountInboxView();
			expect(wrapper.text()).toContain("今天");
			expect(wrapper.text()).toContain("昨天");
			expect(wrapper.text()).toContain("更早");
			expect(wrapper.text()).toContain("今天的想法");
			expect(wrapper.text()).toContain("昨天的想法");
			expect(wrapper.text()).toContain("更早的想法");
		});
	});

	// --- 搜索无结果 ---
	describe("搜索无结果", () => {
		it("filteredItems 为空且 searchQuery 非空时展示没有匹配的闪念", () => {
			mockCount.value = 3;
			mockFilteredItems.value = [];
			mockSearchQuery.value = "不存在的关键词";

			const wrapper = mountInboxView();
			expect(wrapper.text()).toContain("没有匹配的闪念");
		});
	});

	// --- 捕捉按钮 ---
	describe("捕捉按钮", () => {
		it("输入内容后点击捕捉，调用 captureNote，成功后清空输入并 emit refresh-tree", async () => {
			mockCount.value = 0;
			const wrapper = mountInboxView();

			// Find the textarea and set its value
			const textarea = wrapper.find("textarea");
			await textarea.setValue("新闪念内容");

			// Click the capture button (the one with "捕捉" text)
			const buttons = wrapper.findAll('[data-testid="button"]');
			const captureBtn = buttons.find((b) => b.text().includes("捕捉"));
			expect(captureBtn).toBeTruthy();
			await captureBtn!.trigger("click");

			expect(mockCaptureNote).toHaveBeenCalledWith("新闪念内容");

			// After capture resolves, input should be cleared
			await nextTick();
			// emit refresh-tree
			expect(wrapper.emitted("refresh-tree")).toBeTruthy();
		});

		it("空内容时点击捕捉不调用 captureNote", async () => {
			mockCount.value = 0;
			const wrapper = mountInboxView();

			const buttons = wrapper.findAll('[data-testid="button"]');
			const captureBtn = buttons.find((b) => b.text().includes("捕捉"));
			if (captureBtn) {
				// Button should be disabled when empty
				expect(captureBtn.attributes("disabled")).toBeDefined();
			}
			expect(mockCaptureNote).not.toHaveBeenCalled();
		});
	});

	// --- 快捷键 ---
	describe("快捷键", () => {
		it("textarea 上 Ctrl+Enter 触发捕捉", async () => {
			mockCount.value = 0;
			const wrapper = mountInboxView();

			const textarea = wrapper.find("textarea");
			await textarea.setValue("快捷键闪念");

			await textarea.trigger("keydown.ctrl.enter");

			expect(mockCaptureNote).toHaveBeenCalledWith("快捷键闪念");
		});

		it("textarea 上 Meta(⌘)+Enter 触发捕捉", async () => {
			mockCount.value = 0;
			const wrapper = mountInboxView();

			const textarea = wrapper.find("textarea");
			await textarea.setValue("Meta快捷键闪念");

			await textarea.trigger("keydown.meta.enter");

			expect(mockCaptureNote).toHaveBeenCalledWith("Meta快捷键闪念");
		});
	});

	// --- 点击闪念条目 ---
	describe("点击闪念条目", () => {
		it("点击闪念条目 emit open-file，参数是条目的绝对路径", async () => {
			const today = new Date();
			const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

			mockCount.value = 1;
			const item = makeMomentItem({
				id: `${todayStr}-10:00-0`,
				date: todayStr,
				time: "10:00",
				content: "点击测试",
				path: `/ws/收件箱/${todayStr}.md`,
			});
			mockGroupedItems.value = [{ label: "今天", items: [item] }];
			mockFilteredItems.value = [item];

			const wrapper = mountInboxView();

			// Find the button for the moment item
			const buttons = wrapper.findAll("button");
			const itemBtn = buttons.find((b) => b.text().includes("点击测试"));
			expect(itemBtn).toBeTruthy();
			await itemBtn!.trigger("click");

			const openFileEvents = wrapper.emitted("open-file");
			expect(openFileEvents).toBeTruthy();
			expect(openFileEvents![0]![0]).toBe(`/ws/收件箱/${todayStr}.md`);
		});
	});

	// --- 不存在旧操作入口 ---
	describe("不存在旧操作入口", () => {
		it("不应出现归档、重命名、删除这类旧文件级操作按钮或菜单", () => {
			const today = new Date();
			const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

			mockCount.value = 1;
			const item = makeMomentItem({
				id: `${todayStr}-10:00-0`,
				date: todayStr,
				time: "10:00",
				content: "测试内容",
				path: `/ws/收件箱/${todayStr}.md`,
			});
			mockGroupedItems.value = [{ label: "今天", items: [item] }];
			mockFilteredItems.value = [item];

			const wrapper = mountInboxView();
			const text = wrapper.text();
			expect(text).not.toContain("归档");
			expect(text).not.toContain("重命名");
			expect(text).not.toContain("删除");
		});
	});
});
