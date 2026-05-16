import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import WorkspaceSearchView from "../WorkspaceSearchView.vue";
import { getWorkspaceKnowledgeDiagnostics, searchWorkspace, refreshWorkspaceRag } from "@/lib/api";

vi.mock("@/lib/api", () => ({
	getWorkspaceKnowledgeDiagnostics: vi.fn(),
	searchWorkspace: vi.fn(),
	refreshWorkspaceRag: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}));

const globalStubs = {
	Badge: { template: "<span><slot /></span>" },
	Button: { template: "<button v-bind='$attrs'><slot /></button>" },
	Input: { template: "<input v-bind='$attrs' :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" />", props: ["modelValue"], emits: ["update:modelValue"] },
	ScrollArea: { template: "<div><slot /></div>" },
	AlertTriangle: true,
	FileText: true,
	FolderSearch: true,
	LoaderCircle: true,
	RefreshCcw: true,
	Search: true,
};

async function flushAsync() {
	await Promise.resolve();
	await nextTick();
}

describe("WorkspaceSearchView", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.mocked(getWorkspaceKnowledgeDiagnostics).mockResolvedValue({
			rag: {
				indexed: 1,
				pending: 1,
				indexFailed: 1,
				latestIndexedAt: 1000,
				failedTargets: [
					{
						path: "笔记/broken.md",
						error: "embedding provider missing",
						updatedAt: 2000,
						notificationId: "notification-rag-broken",
					},
				],
			},
			memory: {
				memoryPath: "记忆/MEMORY.md",
				exists: true,
				size: 42,
				updatedAt: 3000,
				injected: true,
				dailyCount: 1,
				latestDailyAt: 4000,
			},
			wiki: {
				indexPath: "Wiki/index.md",
				exists: true,
				size: 32,
				updatedAt: 5000,
				injected: true,
				indexStatus: "indexed",
			},
			graph: {
				graphPath: ".ridge/graph.kuzu",
				schemaExists: true,
				databaseExists: true,
				updatedAt: 6000,
				correctionsEndpoint: "/api/workspace/graph/corrections",
			},
			mcp: {
				endpoint: "/api/workspace/mcp",
				boundary: "read_only_workspace_visible_assets",
				tools: [
					{ name: "rag_search", title: "Search workspace RAG chunks" },
					{ name: "graph_search", title: "Search workspace graph" },
					{ name: "file_search", title: "Search visible workspace files" },
					{ name: "read_workspace_file", title: "Read a visible workspace file" },
				],
			},
			backgroundJobs: {
				byStatus: { pending: 1, running: 0, completed: 2, failed: 1, cancelled: 0 },
				byType: [{ type: "rag.index", pending: 1, running: 0, completed: 2, failed: 1, cancelled: 0 }],
				recentFailures: [
					{
						jobId: "job-rag-failed",
						type: "rag.index",
						relatedType: "file",
						relatedId: "笔记/broken.md",
						lastError: "embedding provider missing",
						updatedAt: 7000,
						notificationId: "notification-rag-broken",
					},
				],
			},
			notifications: {
				unhandled: 1,
				ragFailures: 1,
				backgroundFailures: 1,
			},
		});
		vi.mocked(searchWorkspace).mockResolvedValue({
			query: "alpha",
			indexStatus: { indexed: 1, pending: 0, indexFailed: 0 },
			groups: [{ type: "file", count: 1 }],
			results: [
				{
					id: "file:alpha.md",
					type: "file",
					title: "alpha.md",
					path: "笔记/alpha.md",
					sourcePath: "笔记/alpha.md",
					updatedAt: Date.now(),
					snippet: "alpha content",
					score: 100,
				},
			],
		});
		vi.mocked(refreshWorkspaceRag).mockResolvedValue({ success: true, indexed: true });
	});

	it("shows a simple empty state without exposing internal knowledge categories", async () => {
		const wrapper = mount(WorkspaceSearchView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await flushAsync();

		expect(getWorkspaceKnowledgeDiagnostics).toHaveBeenCalled();
		expect(wrapper.text()).toContain("输入关键词查找内容");
		expect(wrapper.text()).toContain("1 个内容暂时搜不到");
		expect(wrapper.text()).not.toContain("知识诊断");
		expect(wrapper.text()).not.toContain("RAG");
		expect(wrapper.text()).not.toContain("Wiki");
		expect(wrapper.text()).not.toContain("记忆");
		expect(wrapper.text()).not.toContain("read_workspace_file");
		expect(wrapper.text()).not.toContain("job-rag-failed");
	});

	it("refreshes hidden indexing issues from the simple empty state", async () => {
		const wrapper = mount(WorkspaceSearchView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await flushAsync();
		await wrapper.findAll("button").find((button) => button.text().includes("重新整理"))!.trigger("click");
		await flushAsync();

		expect(refreshWorkspaceRag).toHaveBeenCalledWith("笔记/broken.md");
		expect(getWorkspaceKnowledgeDiagnostics).toHaveBeenCalledTimes(2);
	});

	it("searches and emits open-file for file results", async () => {
		const wrapper = mount(WorkspaceSearchView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await wrapper.find("input").setValue("alpha");
		await vi.advanceTimersByTimeAsync(200);
		await nextTick();

		expect(searchWorkspace).toHaveBeenCalledWith({ q: "alpha", limit: 100 });
		expect(wrapper.text()).toContain("alpha.md");
		expect(wrapper.text()).not.toContain("全部类型");
		expect(wrapper.text()).not.toContain("文件");

		await wrapper.findAll("button").find((button) => button.text().includes("alpha.md"))!.trigger("click");
		expect(wrapper.emitted("open-file")?.[0]).toEqual(["/workspace/笔记/alpha.md"]);
	});

	it("does not expose manual refresh controls on normal results", async () => {
		const wrapper = mount(WorkspaceSearchView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await wrapper.find("input").setValue("alpha");
		await vi.advanceTimersByTimeAsync(200);
		await nextTick();

		expect(wrapper.findAll("button")).toHaveLength(1);
		expect(refreshWorkspaceRag).not.toHaveBeenCalled();
	});

	it("opens project results through project navigation instead of file navigation", async () => {
		vi.mocked(searchWorkspace).mockResolvedValueOnce({
			query: "alpha",
			indexStatus: { indexed: 0, pending: 0, indexFailed: 0 },
			groups: [{ type: "project", count: 1 }],
			results: [
				{
					id: "project:alpha",
					type: "project",
					title: "Alpha Project",
					path: "/workspace/项目/alpha",
					targetId: "alpha",
					projectId: "alpha",
					updatedAt: Date.now(),
					snippet: "internal /workspace/项目/alpha",
					score: 100,
				},
			],
		});
		const wrapper = mount(WorkspaceSearchView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await wrapper.find("input").setValue("alpha");
		await vi.advanceTimersByTimeAsync(200);
		await nextTick();

		await wrapper.findAll("button").find((button) => button.text().includes("Alpha Project"))!.trigger("click");
		expect(wrapper.emitted("open-project")?.[0]).toEqual(["alpha"]);
		expect(wrapper.emitted("open-file")).toBeUndefined();
	});
});
