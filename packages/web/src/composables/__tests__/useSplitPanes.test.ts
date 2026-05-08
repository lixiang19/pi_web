import { describe, expect, it } from "vitest";
import {
	createChatTab,
	createHomeTab,
	createInitialGrid,
	useSplitPanes,
} from "@/composables/useSplitPanes";

describe("useSplitPanes - chat 类型支持", () => {
	it("createChatTab 返回 kind=chat 标签", () => {
		const tab = createChatTab("session-1", "测试会话");
		expect(tab.kind).toBe("chat");
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
		expect(found!.tab.kind).toBe("chat");
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
		expect(found!.tab.kind).toBe("chat");
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
});
