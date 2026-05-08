import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import HomePage from "@/components/workspace/HomePage.vue";
import type { RecentActivityItem } from "@/composables/useRecentActivity";
import type { RecentFileItem } from "@/lib/api";
import type { AgentSummary, ThinkingLevel } from "@/lib/types";
import { NO_AGENT_VALUE } from "@/composables/useWorkbenchSessionState";

type HomeSubmitPayload = {
	text: string;
	model: string;
	agent: string;
	thinkingLevel: ThinkingLevel;
};

const defaultActivity: RecentActivityItem[] = [
	{
		id: "file-a",
		kind: "file",
		title: "readme.md",
		timestamp: 5000,
		filePath: "/ws/readme.md",
	},
	{
		id: "task-b",
		kind: "task",
		title: "待办事项",
		timestamp: 4000,
		taskId: "task-1",
	},
	{
		id: "moment-c",
		kind: "moment",
		title: "一条闪念",
		timestamp: 3000,
		filePath: "/ws/收件箱/2026-04-30.md",
	},
	{
		id: "session-d",
		kind: "session",
		title: "旧会话",
		timestamp: 2000,
		sessionId: "session-old",
	},
];

const defaultRecentFiles: RecentFileItem[] = [
	{
		name: "readme.md",
		path: "/ws/readme.md",
		relativePath: "readme.md",
		modifiedAt: 5000,
		extension: ".md",
		size: 100,
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
	recentFiles: defaultRecentFiles,
	recentActivity: defaultActivity,
	isRecentLoading: false,
	models: defaultModels,
	agents: defaultAgents,
	defaultModel: "gpt-4",
	defaultAgent: "",
	defaultThinkingLevel: "medium" as const,
};

function mountHomePage(overrides: Record<string, unknown> = {}) {
	return mount(HomePage, {
		props: { ...defaultProps, ...overrides },
		global: {
			stubs: {
				ScrollArea: { template: "<div><slot /></div>" },
				Card: { template: "<div><slot /></div>" },
				CardHeader: { template: "<div><slot /></div>" },
				CardTitle: { template: "<div><slot /></div>" },
				CardContent: { template: "<div><slot /></div>" },
				Badge: { template: "<span><slot /></span>" },
				Separator: { template: "<hr />" },
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

describe("HomePage - AI 启动台", () => {
	it("初始展示 AI 启动台和下方三块区域", () => {
		const wrapper = mountHomePage();
		const text = wrapper.text();
		expect(text).toContain("开始对话");
		expect(text).toContain("最近事情");
		expect(text).toContain("最近文件");
		expect(text).toContain("AI 建议");
	});

	it("输入框位于独立居中区域，信息区在其下方", () => {
		const wrapper = mountHomePage();
		const hero = wrapper.find('[data-testid="home-ai-hero"]');
		const infoGrid = wrapper.find('[data-testid="home-info-grid"]');

		expect(hero.exists()).toBe(true);
		expect(infoGrid.exists()).toBe(true);
		expect(hero.classes()).toEqual(expect.arrayContaining(["min-h-[42vh]", "justify-center"]));
	});

	it("默认展示模型、Agent、思考级别选择器", () => {
		const wrapper = mountHomePage();
		const selects = wrapper.findAll('[data-testid="select"]');
		expect(selects).toHaveLength(3);
	});

	it("下拉内容使用受控高度，模型菜单有足够宽度", async () => {
		const wrapper = mountHomePage();
		const contents = wrapper.findAll('[data-testid="select-content"]');
		expect(contents).toHaveLength(3);
		for (const content of contents) {
			expect(content.classes()).toContain("max-h-72");
		}
		expect(contents[0]!.classes()).toContain("min-w-[280px]");
	});

	it("聚焦后继续保留完整真实控件（模型/Agent/思考级别选择器）", async () => {
		const wrapper = mountHomePage();
		const textarea = wrapper.find("textarea");
		await textarea.trigger("focus");

		const selects = wrapper.findAll('[data-testid="select"]');
		expect(selects).toHaveLength(3);
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
		expect(payload.agent).toBe(NO_AGENT_VALUE);
		expect(payload.thinkingLevel).toBe("medium");
	});

	it("空输入不触发 submit", async () => {
		const wrapper = mountHomePage();
		await wrapper.find("form").trigger("submit.prevent");
		expect(wrapper.emitted("submit")).toBeFalsy();
	});

	it("最近事情条目可点击，触发 open-file", async () => {
		const wrapper = mountHomePage();
		const buttons = wrapper.findAll("button");

		const fileItem = buttons.find((b) => b.text().includes("readme.md"));
		expect(fileItem).toBeTruthy();
		await fileItem!.trigger("click");

		expect(wrapper.emitted("open-file")).toBeTruthy();
		expect(wrapper.emitted("open-file")![0]![0]).toBe("/ws/readme.md");
	});

	it("点击会话条目触发 open-session", async () => {
		const wrapper = mountHomePage();
		const buttons = wrapper.findAll("button");

		const sessionItem = buttons.find((b) => b.text().includes("旧会话"));
		expect(sessionItem).toBeTruthy();
		await sessionItem!.trigger("click");

		expect(wrapper.emitted("open-session")).toBeTruthy();
		expect(wrapper.emitted("open-session")![0]![0]).toBe("session-old");
	});

	it("点击待办条目触发 open-tasks", async () => {
		const wrapper = mountHomePage();
		const buttons = wrapper.findAll("button");

		const taskItem = buttons.find((b) => b.text().includes("待办事项"));
		expect(taskItem).toBeTruthy();
		await taskItem!.trigger("click");

		expect(wrapper.emitted("open-tasks")).toBeTruthy();
	});

	it("AI 建议为占位卡片，不触发 AI 请求", () => {
		const wrapper = mountHomePage();
		expect(wrapper.text()).toContain("AI 建议");
		expect(wrapper.text()).toContain("即将推出");
	});

	it("加载中状态显示", () => {
		const wrapper = mountHomePage({ isRecentLoading: true });
		expect(wrapper.text()).toContain("加载中");
	});

	it("空数据状态显示", () => {
		const wrapper = mountHomePage({
			recentActivity: [],
			recentFiles: [],
		});
		expect(wrapper.text()).toContain("暂无最近活动");
		expect(wrapper.text()).toContain("暂无文件");
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
