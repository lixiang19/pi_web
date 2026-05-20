import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import HomePage from "@/components/workspace/HomePage.vue";
import type { AgentSummary, ThinkingLevel, YesterdayReview, TodayRecommendation } from "@/lib/types";

type HomeSubmitPayload = {
	text: string;
	model: string;
	agent: string;
	thinkingLevel: ThinkingLevel;
};

const defaultYesterdayReview: YesterdayReview = {
	summary: "昨天你进行了 3 个会话、编辑了 12 个文件。",
	stats: [
		{ label: "会话", value: "3", icon: "session" },
		{ label: "文件编辑", value: "12", icon: "file" },
		{ label: "待办完成", value: "4", icon: "task" },
		{ label: "闪念捕获", value: "2", icon: "moment" },
	],
	highlights: [
		{ text: "下午 2-4 点是你效率最高的时段", kind: "trend" },
	],
};

const defaultTodayRecommendations: TodayRecommendation[] = [
	{
		id: "rec-1",
		title: "继续「架构重构」",
		reason: "上次会话有待续内容。",
		priority: "high",
		action: "continue-session",
		icon: "session",
		actionTarget: "session-1",
	},
	{
		id: "rec-2",
		title: "整理闪念笔记",
		reason: "你有 2 条未归档的闪念。",
		priority: "medium",
		action: "open-inbox",
		icon: "moment",
	},
	{
		id: "rec-3",
		title: "继续编辑 readme.md",
		reason: "最近修改的文件。",
		priority: "medium",
		action: "open-file",
		icon: "file",
		actionTarget: "/ws/readme.md",
	},
	{
		id: "rec-4",
		title: "完成今日待办 (3)",
		reason: "还有 3 项待办需要处理。",
		priority: "low",
		action: "open-tasks",
		icon: "task",
	},
];

const defaultModels = [
	{ label: "GPT-4", value: "gpt-4" },
	{ label: "Claude", value: "claude-3" },
];

const defaultAgents: AgentSummary[] = [
	{
		name: "coding-agent",
		model: "gpt-4",
		thinking: "medium",
		description: "",
		mode: "primary",
		enabled: true,
		sourceScope: "project",
		source: "project",
	},
];

const defaultProps = {
	workspaceDir: "/ws",
	models: defaultModels,
	agents: defaultAgents,
	defaultModel: "gpt-4",
	defaultAgent: "",
	defaultThinkingLevel: "medium" as const,
	yesterdayReview: defaultYesterdayReview,
	todayRecommendations: defaultTodayRecommendations,
};

function mountHomePage(overrides: Record<string, unknown> = {}) {
	return mount(HomePage, {
		props: { ...defaultProps, ...overrides },
		global: {
			stubs: {
				ScrollArea: { template: "<div><slot /></div>" },
				Badge: { template: "<span><slot /></span>" },
				Card: { template: "<div class=\"group\" @click=\"$emit('click')\"><slot /></div>", emits: ["click"] },
				Textarea: {
					template:
						'<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @focus="$emit(\'focus\')" @blur="$emit(\'blur\')" />',
					props: ["modelValue"],
					emits: ["update:modelValue", "focus", "blur"],
				},
				Button: {
					template:
						'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
					props: ["disabled"],
					emits: ["click"],
				},
				Select: {
					template: '<div data-testid="select"><slot /></div>',
					props: ["modelValue"],
					emits: ["update:modelValue"],
				},
				SelectTrigger: { template: "<div><slot /></div>" },
				SelectContent: { template: '<div data-testid="select-content"><slot /></div>' },
				SelectItem: { template: "<div><slot /></div>" },
				SelectValue: { template: "<span><slot /></span>" },
			},
		},
	});
}

describe("HomePage - AI 输入与仪表盘", () => {
	it("渲染问候语和今日推荐、昨日回顾", () => {
		const wrapper = mountHomePage();
		const text = wrapper.text();
		expect(text).toContain("好"); // 上午好/下午好/晚上好
		expect(text).toContain("今日推荐");
		expect(text).toContain("昨日回顾");
	});

	it("渲染推荐卡片", () => {
		const wrapper = mountHomePage();
		expect(wrapper.text()).toContain("继续「架构重构」");
		expect(wrapper.text()).toContain("整理闪念笔记");
	});

	it("渲染昨日回顾统计", () => {
		const wrapper = mountHomePage();
		expect(wrapper.text()).toContain("3");
		expect(wrapper.text()).toContain("会话");
		expect(wrapper.text()).toContain("12");
		expect(wrapper.text()).toContain("文件编辑");
	});

	it("渲染高亮事件", () => {
		const wrapper = mountHomePage();
		expect(wrapper.text()).toContain("下午 2-4 点是你效率最高的时段");
	});

	it("点击推荐卡片触发 recommendation-click", async () => {
		const wrapper = mountHomePage();
		const recCards = wrapper.findAll('[data-testid="recommendation-card"]');
		expect(recCards.length).toBeGreaterThanOrEqual(1);
		await recCards[0]!.trigger("click");
		expect(wrapper.emitted("recommendation-click")).toBeTruthy();
		const rec = wrapper.emitted("recommendation-click")![0]![0] as TodayRecommendation;
		expect(rec.id).toBe("rec-1");
		expect(rec.action).toBe("continue-session");
	});

	it("默认展示模型、Agent、思考级别选择器", () => {
		const wrapper = mountHomePage();
		const selects = wrapper.findAll('[data-testid="select"]');
		expect(selects).toHaveLength(3);
	});

	it("Agent 选择器默认选择第一个 Agent", async () => {
		const wrapper = mountHomePage();
		expect(wrapper.text()).not.toContain("无 Agent");

		const textarea = wrapper.find("textarea");
		await textarea.setValue("使用默认 agent");
		await wrapper.find("form").trigger("submit.prevent");

		const payload = wrapper.emitted("submit")![0]![0] as HomeSubmitPayload;
		expect(payload.agent).toBe("coding-agent");
	});

	it("下拉内容使用受控高度", () => {
		const wrapper = mountHomePage();
		const contents = wrapper.findAll('[data-testid="select-content"]');
		expect(contents).toHaveLength(3);
		for (const content of contents) {
			expect(content.classes()).toContain("max-h-72");
		}
	});

	it("提交首条消息触发 submit 事件，携带完整 payload", async () => {
		const wrapper = mountHomePage();
		const textarea = wrapper.find("textarea");
		await textarea.setValue("帮我写个函数");
		await wrapper.find("form").trigger("submit.prevent");

		expect(wrapper.emitted("submit")).toBeTruthy();
		const payload = wrapper.emitted("submit")![0]![0] as HomeSubmitPayload;
		expect(payload.text).toBe("帮我写个函数");
		expect(payload.model).toBe("gpt-4");
		expect(payload.agent).toBe("coding-agent");
		expect(payload.thinkingLevel).toBe("medium");
	});

	it("异步加载默认模型后同步选择值", async () => {
		const wrapper = mountHomePage({
			models: [],
			defaultModel: "",
		});

		await wrapper.setProps({
			models: defaultModels,
			defaultModel: "claude-3",
		});

		const textarea = wrapper.find("textarea");
		await textarea.setValue("用加载后的模型");
		await wrapper.find("form").trigger("submit.prevent");

		const payload = wrapper.emitted("submit")![0]![0] as HomeSubmitPayload;
		expect(payload.model).toBe("claude-3");
	});

	it("空输入不触发 submit", async () => {
		const wrapper = mountHomePage();
		await wrapper.find("form").trigger("submit.prevent");
		expect(wrapper.emitted("submit")).toBeFalsy();
	});
});

describe("HomePage - 附件上传入口", () => {
	it("选择文件后显示待附加文件列表", async () => {
		const wrapper = mountHomePage();
		const fileInput = wrapper.find('input[type="file"]');
		expect(fileInput.exists()).toBe(true);

		const file = new File(["content"], "notes.md", { type: "text/markdown" });
		const inputEl = fileInput.element as HTMLInputElement;
		Object.defineProperty(inputEl, "files", { value: [file], writable: false });
		await fileInput.trigger("change");

		const pending = wrapper.findAll('[data-testid="home-pending-attachment"]');
		expect(pending.length).toBe(1);
		expect(pending[0]!.text()).toContain("notes.md");
	});

	it("submit payload 包含 attachments 字段", async () => {
		const wrapper = mountHomePage();
		const textarea = wrapper.find("textarea");
		await textarea.setValue("带附件的提问");

		const fileInput = wrapper.find('input[type="file"]');
		const file = new File(["c"], "doc.md", { type: "text/markdown" });
		const inputEl = fileInput.element as HTMLInputElement;
		Object.defineProperty(inputEl, "files", { value: [file], writable: false });
		await fileInput.trigger("change");

		await wrapper.find("form").trigger("submit.prevent");
		const payload = wrapper.emitted("submit")![0]![0] as HomeSubmitPayload & { attachments?: File[] };
		expect(payload.text).toBe("带附件的提问");
		expect(payload.attachments).toHaveLength(1);
		expect(payload.attachments![0]?.name).toBe("doc.md");
	});
});

describe("HomePage - 提交 payload 完整性", () => {
	it("submit payload 包含 text、model、agent、thinkingLevel 四个字段", async () => {
		const wrapper = mountHomePage({
			defaultModel: "claude-3",
			defaultAgent: "coding-agent",
			defaultThinkingLevel: "high",
		});
		const textarea = wrapper.find("textarea");
		await textarea.setValue("测试完整 payload");
		await wrapper.find("form").trigger("submit.prevent");

		const payload = wrapper.emitted("submit")![0]![0] as HomeSubmitPayload;
		expect(payload).toEqual({
			text: "测试完整 payload",
			model: "claude-3",
			agent: "coding-agent",
			thinkingLevel: "high",
		});
	});
});

describe("HomePage - 发送状态", () => {
	it("isSending prop 为 true 时提交按钮禁用", () => {
		const wrapper = mountHomePage({ isSending: true });
		const btn = wrapper.find('[data-testid="home-send-btn"]');
		expect((btn.element as HTMLButtonElement).disabled).toBe(true);
	});

	it("isSending prop 变为 false 后按钮恢复可用", async () => {
		const wrapper = mountHomePage({ isSending: true });
		const textarea = wrapper.find("textarea");
		await textarea.setValue("有内容");
		const btn = wrapper.find('[data-testid="home-send-btn"]');
		expect((btn.element as HTMLButtonElement).disabled).toBe(true);

		await wrapper.setProps({ isSending: false });
		const btnAfter = wrapper.find('[data-testid="home-send-btn"]');
		expect((btnAfter.element as HTMLButtonElement).disabled).toBe(false);
	});

	it("submit 不立即清空 draft，失败时保留输入", async () => {
		const wrapper = mountHomePage();
		const textarea = wrapper.find("textarea");
		await textarea.setValue("保留输入测试");
		await wrapper.find("form").trigger("submit.prevent");

		const emitted = wrapper.emitted("submit");
		expect(emitted).toBeTruthy();
		expect((textarea.element as HTMLTextAreaElement).value).toBe("保留输入测试");
	});
});