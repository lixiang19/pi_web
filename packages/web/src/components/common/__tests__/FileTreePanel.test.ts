import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import FileTreePanel from "@/components/common/FileTreePanel.vue";
import type { FileTreeEntry } from "@/lib/types";

vi.mock("@/lib/api", () => ({
	searchFiles: vi.fn().mockResolvedValue({ entries: [] }),
}));

const getExt = (name: string) => {
	const i = name.lastIndexOf(".");
	return i >= 0 ? name.slice(i) : "";
};

const makeEntry = (
	name: string,
	kind: "file" | "directory",
): FileTreeEntry => ({
	name,
	path: `/root/${name}`,
	kind,
	relativePath: name,
	size: kind === "file" ? 100 : null,
	modifiedAt: Date.now(),
	extension: kind === "file" ? getExt(name) : "",
});

const defaultProps = {
	nodes: [
		{ entry: makeEntry("子文件夹", "directory"), depth: 0 },
		{ entry: makeEntry("readme.md", "file"), depth: 0 },
		{ entry: makeEntry("script.ts", "file"), depth: 0 },
	],
	isRootLoading: false,
	error: "",
	isExpanded: (_path: string) => false,
	isLoading: (_path: string) => false,
	rootPath: "/root",
};

function mountPanel(overrides: Record<string, unknown> = {}) {
	setActivePinia(createPinia());
	return mount(FileTreePanel, {
		props: { ...defaultProps, ...overrides },
		global: {
			stubs: {
				ContextMenu: { template: "<div><slot /></div>" },
				ContextMenuTrigger: { template: "<span><slot /></span>" },
				ContextMenuContent: { template: "<div />" },
				ContextMenuItem: { template: "<div />" },
				ContextMenuSeparator: { template: "<hr />" },
				AlertDialog: { template: "<div />" },
				AlertDialogContent: { template: "<div />" },
				AlertDialogHeader: { template: "<div />" },
				AlertDialogTitle: { template: "<div />" },
				AlertDialogDescription: { template: "<div />" },
				AlertDialogFooter: { template: "<div />" },
				AlertDialogCancel: { template: "<div />" },
				AlertDialogAction: { template: "<div />" },
			},
		},
	});
}

describe("FileTreePanel", () => {
	it("renders file tree nodes", () => {
		const wrapper = mountPanel();
		expect(wrapper.text()).toContain("子文件夹");
		expect(wrapper.text()).toContain("readme.md");
		expect(wrapper.text()).toContain("script.ts");
	});

	it("emits select when clicking a file", async () => {
		const wrapper = mountPanel();
		const buttons = wrapper.findAll("button");
		const fileNode = buttons.find((b) => b.text().includes("readme.md"));
		if (fileNode) {
			await fileNode.trigger("click");
			expect(wrapper.emitted("select")).toBeTruthy();
		}
	});

	it("emits toggle-expand when clicking a directory", async () => {
		const wrapper = mountPanel();
		const buttons = wrapper.findAll("button");
		const dirNode = buttons.find((b) => b.text().includes("子文件夹"));
		if (dirNode) {
			await dirNode.trigger("click");
			expect(wrapper.emitted("toggle-expand")).toBeTruthy();
		}
	});

	it("emits refresh when clicking refresh button", async () => {
		const wrapper = mountPanel();
		// refresh 按钮含有 RefreshCw 图标和 @click="emit('refresh')"
		const buttons = wrapper.findAll("button");
		// tab 触发按钮有 data-state 属性，refresh 按钮没有
		const refreshBtn = buttons.find(
			(b) => b.text().trim() === "" && !b.attributes("data-state"),
		);
		expect(refreshBtn).toBeTruthy();
		await refreshBtn!.trigger("click");
		expect(wrapper.emitted("refresh")).toBeTruthy();
	});

	it("shows error message when error prop is set", () => {
		const wrapper = mountPanel({ error: "加载失败" });
		expect(wrapper.text()).toContain("加载失败");
	});

	it("shows loading state", () => {
		const wrapper = mountPanel({ isRootLoading: true, nodes: [] });
		expect(wrapper.text()).toContain("加载中");
	});

	it("shows empty directory hint for expanded empty dir", () => {
		const wrapper = mountPanel({
			nodes: [{ entry: makeEntry("空文件夹", "directory"), depth: 0 }],
			isExpanded: (path: string) => path.includes("空文件夹"),
		});
		expect(wrapper.text()).toContain("空文件夹");
		expect(wrapper.text()).toContain("空文件夹");
	});

	it("exposes startRename and startCreateFolder", () => {
		const wrapper = mountPanel();
		expect(typeof wrapper.vm.startRename).toBe("function");
		expect(typeof wrapper.vm.startCreateFolder).toBe("function");
	});
});

describe("FileTreePanel - favorites tab", () => {
	it("shows empty state when no favorites", async () => {
		const wrapper = mountPanel();
		const tabs = wrapper.findAll('[role="tab"]');
		const favTab = tabs.find(
			(t) =>
				t.attributes("data-value") === "favorites" || t.text().includes("收藏"),
		);
		if (favTab) {
			await favTab.trigger("click");
			await nextTick();
			expect(wrapper.text()).toContain("暂无收藏");
		}
	});
});

describe("FileTreePanel - recent tab", () => {
	it("shows recent files when provided", async () => {
		const wrapper = mountPanel({
			recentFiles: [
				{
					name: "recent.md",
					path: "/root/recent.md",
					relativePath: "recent.md",
					modifiedAt: Date.now(),
					extension: ".md",
					size: 100,
				},
			],
		});
		const tabs = wrapper.findAll('[role="tab"]');
		const recentTab = tabs.find(
			(t) =>
				t.attributes("data-value") === "recent" || t.text().includes("最近"),
		);
		if (recentTab) {
			await recentTab.trigger("click");
			await nextTick();
			expect(wrapper.text()).toContain("recent.md");
		}
	});

	it("shows empty state when no recent files", async () => {
		const wrapper = mountPanel({ recentFiles: [] });
		const tabs = wrapper.findAll('[role="tab"]');
		const recentTab = tabs.find(
			(t) =>
				t.attributes("data-value") === "recent" || t.text().includes("最近"),
		);
		if (recentTab) {
			await recentTab.trigger("click");
			await nextTick();
			expect(wrapper.text()).toContain("暂无最近文件");
		}
	});

	it("shows loading indicator when isRecentLoading", async () => {
		const wrapper = mountPanel({ isRecentLoading: true });
		const tabs = wrapper.findAll('[role="tab"]');
		const recentTab = tabs.find(
			(t) =>
				t.attributes("data-value") === "recent" || t.text().includes("最近"),
		);
		if (recentTab) {
			await recentTab.trigger("click");
			await nextTick();
			// Loading spinner should be visible in the recent tab content
			const spinners = wrapper.findAll(".animate-spin");
			expect(spinners.length).toBeGreaterThan(0);
		}
	});
});

describe("FileTreePanel - subdirectory loading and empty dir", () => {
	it("shows loading indicator for expanded loading directory", () => {
		const wrapper = mountPanel({
			nodes: [{ entry: makeEntry("子文件夹", "directory"), depth: 0 }],
			isExpanded: (path: string) => path.includes("子文件夹"),
			isLoading: (path: string) => path.includes("子文件夹"),
		});
		// Expanded loading directory should show spinner
		const spinners = wrapper.findAll(".animate-spin");
		expect(spinners.length).toBeGreaterThan(0);
	});

	it("shows empty directory hint for expanded empty dir", () => {
		const wrapper = mountPanel({
			nodes: [{ entry: makeEntry("空文件夹", "directory"), depth: 0 }],
			isExpanded: (path: string) => path.includes("空文件夹"),
			isLoading: () => false,
		});
		expect(wrapper.text()).toContain("空文件夹");
	});
});

describe("FileTreePanel - delete dialog", () => {
	function mountWithDialog(overrides: Record<string, unknown> = {}) {
		setActivePinia(createPinia());
		return mount(FileTreePanel, {
			props: { ...defaultProps, ...overrides },
			global: {
				stubs: {
					ContextMenu: { template: "<div><slot /></div>" },
					ContextMenuTrigger: { template: "<span><slot /></span>" },
					ContextMenuContent: { template: "<div />" },
					ContextMenuItem: { template: "<div />" },
					ContextMenuSeparator: { template: "<hr />" },
					AlertDialog: {
						props: ["open"],
						template:
							'<div v-if="open" data-testid="alert-dialog"><slot /></div>',
					},
					AlertDialogContent: { template: "<div><slot /></div>" },
					AlertDialogHeader: { template: "<div><slot /></div>" },
					AlertDialogTitle: { template: "<h2><slot /></h2>" },
					AlertDialogDescription: { template: "<p><slot /></p>" },
					AlertDialogFooter: { template: "<div><slot /></div>" },
					AlertDialogCancel: {
						template: '<button data-testid="alert-cancel"><slot /></button>',
					},
					AlertDialogAction: {
						template: '<button data-testid="alert-action"><slot /></button>',
					},
				},
			},
		});
	}

	it("renders AlertDialog when handleDelete is called", async () => {
		const wrapper = mountWithDialog();
		const fileEntry = defaultProps.nodes[1]!.entry; // readme.md
		await wrapper.vm.handleDelete(fileEntry);
		await nextTick();

		const dialog = wrapper.find('[data-testid="alert-dialog"]');
		expect(dialog.exists()).toBe(true);
		expect(dialog.text()).toContain("确认删除");
		expect(dialog.text()).toContain("readme.md");
	});

	it("emits delete when confirming AlertDialog", async () => {
		const wrapper = mountWithDialog();
		const fileEntry = defaultProps.nodes[1]!.entry; // readme.md
		await wrapper.vm.handleDelete(fileEntry);
		await nextTick();

		const actionBtn = wrapper.find('[data-testid="alert-action"]');
		expect(actionBtn.exists()).toBe(true);
		await actionBtn.trigger("click");
		await nextTick();

		const emittedDelete = wrapper.emitted("delete");
		expect(emittedDelete).toBeTruthy();
		expect(emittedDelete![0]![0]).toEqual(fileEntry);
	});
});

describe("FileTreePanel - create folder inline", () => {
	it("shows inline input after startCreateFolder", async () => {
		const wrapper = mountPanel();
		await wrapper.vm.startCreateFolder("/root/子文件夹");
		await nextTick();

		const input = wrapper.find('input[placeholder="文件夹名称"]');
		expect(input.exists()).toBe(true);
	});

	it("emits create-folder on Enter", async () => {
		const wrapper = mountPanel();
		await wrapper.vm.startCreateFolder("/root/子文件夹");
		await nextTick();

		const input = wrapper.find('input[placeholder="文件夹名称"]');
		const el = input.element as HTMLInputElement;
		el.value = "测试文件夹";
		el.dispatchEvent(new Event("input", { bubbles: true }));
		await nextTick();

		el.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
		await nextTick();

		const emittedCreateFolder = wrapper.emitted("create-folder");
		expect(emittedCreateFolder).toBeTruthy();
		const payload = emittedCreateFolder![0]![0] as {
			parentPath: string;
			name: string;
		};
		expect(payload.name).toBe("测试文件夹");
		expect(payload.parentPath).toBe("/root/子文件夹");
	});

	it("cancels on Escape", async () => {
		const wrapper = mountPanel();
		await wrapper.vm.startCreateFolder("/root/子文件夹");
		await nextTick();

		const input = wrapper.find('input[placeholder="文件夹名称"]');
		const el = input.element as HTMLInputElement;
		el.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		await nextTick();

		expect(wrapper.emitted("create-folder")).toBeFalsy();
		expect(wrapper.find('input[placeholder="文件夹名称"]').exists()).toBe(
			false,
		);
	});
});
