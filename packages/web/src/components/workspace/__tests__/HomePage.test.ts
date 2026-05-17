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
				Badge: { template: "<span><slot /></span>" },
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

describe("HomePage - 扁平命令行启动台", () => {
	it("初始展示 ridge 标识、工作空间路径和输入区域", () => {
		const wrapper = mountHomePage();
		const text = wrapper.text();
		expect(text).toContain("ridge");
		expect(text).toContain("/ws");
		expect(text).toContain("工作台动态");
		// 验证 Textarea placeholder 存在（placeholder 在 stub 中渲染为属性而非文本）
		const textarea = wrapper.find("textarea");
		expect(textarea.attributes("placeholder")).toBe("问我任何事…");
	});

	it("输入框位于命令行区域，有底线边框样式", () => {
		const wrapper = mountHomePage();
		const hero = wrapper.find('[data-testid="home-ai-hero"]');
		const infoGrid = wrapper.find('[data-testid="home-info-grid"]');
		const commandCenter = wrapper.find('[data-testid="home-command-center"]');

		expect(hero.exists()).toBe(true);
		expect(infoGrid.exists()).toBe(true);
		expect(commandCenter.exists()).toBe(true);
		expect(hero.classes()).toContain("min-h-[280px]");
	});

	it("显示工作空间路径和类型标签", () => {
		const wrapper = mountHomePage();
		const text = wrapper.text();

		expect(text).toContain("/ws");
		// 动态列表中应包含各类型标签
		expect(text).toContain("文件");
		expect(text).toContain("待办");
		expect(text).toContain("闪念");
		expect(text).toContain("会话");
	});

	it("默认展示模型、Agent、思考级别选择器", () => {
		const wrapper = mountHomePage();
		const selects = wrapper.findAll('[data-testid="select"]');
		expect(selects).toHaveLength(3);
	});

	it("下拉内容使用受控高度", async () => {
		const wrapper = mountHomePage();
		const contents = wrapper.findAll('[data-testid="select-content"]');
		expect(contents).toHaveLength(3);
		for (const content of contents) {
			expect(content.classes()).toContain("max-h-72");
		}
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

	it("异步加载默认模型后同步首页选择值", async () => {
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

	it("最近动态中文件条目可点击，触发 open-file", async () => {
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

	it("加载中状态显示", () => {
		const wrapper = mountHomePage({ isRecentLoading: true });
		expect(wrapper.text()).toContain("加载中");
	});

	it("空数据状态显示", () => {
		const wrapper = mountHomePage({
			recentActivity: [],
			recentFiles: [],
		});
		expect(wrapper.text()).toContain("暂无动态");
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

describe("HomePage - 发送状态与失败保留", () => {
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
		// draftText 不应被清空
		expect((textarea.element as HTMLTextAreaElement).value).toBe("保留输入测试");
	});
});