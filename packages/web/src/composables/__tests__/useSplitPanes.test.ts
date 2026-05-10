import { describe, expect, it } from "vitest";
import {
	createChatTab,
	createHomeTab,
	createInitialGrid,
	createSingletonFeatureTab,
	createSpacePreviewTab,
	createTerminalTab,
	useSplitPanes,
} from "@/composables/useSplitPanes";

describe("useSplitPanes - 工作台标签类型", () => {
	it("createChatTab 返回 conversation 标签", () => {
		const tab = createChatTab("session-1", "测试会话");
		expect(tab.kind).toBe("conversation");
		expect(tab.sessionId).toBe("session-1");
		expect(tab.title).toBe("测试会话");
		expect(tab.id).toMatch(/^chat-/);
	});

	it("createChatTab 携带 initialPrompt/initialModel/initialAgent", () => {
		const tab = createChatTab("session-1", "带首条消息的会话", {
			initialPrompt: "帮我写个函数",
			initialModel: "gpt-4",
			initialAgent: "coding-agent",
		});
		expect(tab.initialPrompt).toBe("帮我写个函数");
		expect(tab.initialModel).toBe("gpt-4");
		expect(tab.initialAgent).toBe("coding-agent");
	});

	it("createChatTab 无 options 时 initialPrompt 等为 undefined", () => {
		const tab = createChatTab("session-1", "无首条消息");
		expect(tab.initialPrompt).toBeUndefined();
		expect(tab.initialModel).toBeUndefined();
		expect(tab.initialAgent).toBeUndefined();
	});

	it("createHomeTab 返回 kind=home 标签", () => {
		const tab = createHomeTab();
		expect(tab.kind).toBe("home");
		expect(tab.title).toBe("主页");
		expect(tab.id).toMatch(/^home-/);
	});

	it("createHomeTab 支持传入 cwd 和 contextLabel", () => {
		const tab = createHomeTab({ cwd: "/project/foo", contextLabel: "foo" });
		expect(tab.cwd).toBe("/project/foo");
		expect(tab.contextLabel).toBe("foo");
	});

	it("createHomeTab 不传参数时 cwd 和 contextLabel 为 undefined", () => {
		const tab = createHomeTab();
		expect(tab.cwd).toBeUndefined();
		expect(tab.contextLabel).toBeUndefined();
	});

	it("初始网格默认包含一个 home 标签", () => {
		const grid = createInitialGrid();
		expect(grid.type).toBe("pane");
		if (grid.type === "pane") {
			expect(grid.tabs).toHaveLength(1);
			expect(grid.tabs[0]!.kind).toBe("home");
		}
	});

	it("openTab 可以打开 chat 类型标签", () => {
		const sp = useSplitPanes();
		const chatTab = createChatTab("session-abc", "对话");
		sp.openTab(sp.activePaneGroupId.value, chatTab);

		const found = sp.findTabAcrossPanes(chatTab.id);
		expect(found).toBeTruthy();
		expect(found!.tab.kind).toBe("conversation");
		expect(found!.tab.sessionId).toBe("session-abc");
	});

	it("replaceTab 将 home 标签原地替换为带 initialPrompt 的 chat 标签", () => {
		const sp = useSplitPanes();
		const homeTab = createHomeTab();
		sp.openTab(sp.activePaneGroupId.value, homeTab);

		const chatTab = createChatTab("session-123", "转换后的会话", {
			initialPrompt: "首条消息",
			initialModel: "gpt-4",
			initialAgent: "agent-x",
		});
		sp.replaceTab(homeTab.id, chatTab);

		const found = sp.findTabAcrossPanes(chatTab.id);
		expect(found).toBeTruthy();
		expect(found!.tab.kind).toBe("conversation");
		expect(found!.tab.initialPrompt).toBe("首条消息");
		expect(found!.tab.initialModel).toBe("gpt-4");
		expect(found!.tab.initialAgent).toBe("agent-x");
	});

	it("closeTab 关闭 chat 标签后面板补 home", () => {
		const sp = useSplitPanes();
		const chatTab = createChatTab("session-xyz", "临时会话");
		sp.openTab(sp.activePaneGroupId.value, chatTab);

		// 面板应有 2 个标签（初始 home + chat）
		const pane = sp.allPaneGroups.value[0];
		expect(pane!.tabs.length).toBeGreaterThanOrEqual(2);

		sp.closeTab(sp.activePaneGroupId.value, chatTab.id);

		// chat 标签已关，应还剩至少一个标签
		const remaining = sp.allPaneGroups.value[0]!;
		expect(remaining.tabs.some((t) => t.id === chatTab.id)).toBe(false);
	});

	it("+ 按钮创建新 home 标签（handleNewTab 模式）", () => {
		const sp = useSplitPanes();
		const paneId = sp.activePaneGroupId.value;

		// 模拟 "+" 按钮点击
		sp.openTab(paneId, createHomeTab());

		const allTabs = sp.allPaneGroups.value.flatMap((p) => p.tabs);
		const homeCount = allTabs.filter((t) => t.kind === "home").length;
		expect(homeCount).toBeGreaterThanOrEqual(2);
	});

	it("createSingletonFeatureTab 使用稳定 id 支持单例激活", () => {
		const sp = useSplitPanes();
		const paneId = sp.activePaneGroupId.value;
		sp.openTab(paneId, createSingletonFeatureTab("tasks", "任务"));
		sp.openTab(paneId, createSingletonFeatureTab("tasks", "任务"));

		const allTabs = sp.allPaneGroups.value.flatMap((p) => p.tabs);
		expect(allTabs.filter((tab) => tab.id === "feature:tasks")).toHaveLength(1);
		expect(sp.findTabAcrossPanes("feature:tasks")?.tab).toMatchObject({
			kind: "singleton_feature",
			featureId: "tasks",
		});
	});

	it("终端标签使用独立 id，允许同一入口多开", () => {
		const sp = useSplitPanes();
		const paneId = sp.activePaneGroupId.value;
		sp.openTab(paneId, createTerminalTab("terminal-1", "终端"));
		sp.openTab(paneId, createTerminalTab("terminal-2", "终端"));

		const terminals = sp.allPaneGroups.value
			.flatMap((p) => p.tabs)
			.filter((tab) => tab.kind === "terminal");
		expect(terminals).toHaveLength(2);
		expect(new Set(terminals.map((tab) => tab.id)).size).toBe(2);
	});

	it("createSpacePreviewTab 返回 space_preview 标签", () => {
		const tab = createSpacePreviewTab("/ws/空间/demo/index.html", "demo");
		expect(tab.kind).toBe("space_preview");
		expect(tab.filePath).toBe("/ws/空间/demo/index.html");
		expect(tab.id).toBe("space:/ws/空间/demo/index.html");
	});
});
