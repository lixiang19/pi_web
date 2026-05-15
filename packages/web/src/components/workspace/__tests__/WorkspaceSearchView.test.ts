import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";

import WorkspaceSearchView from "../WorkspaceSearchView.vue";
import { searchWorkspace, refreshWorkspaceRag } from "@/lib/api";

vi.mock("@/lib/api", () => ({
	searchWorkspace: vi.fn(),
	refreshWorkspaceRag: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}));

const SelectStub = defineComponent({
	props: ["modelValue"],
	emits: ["update:modelValue"],
	template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`,
});

const globalStubs = {
	Badge: { template: "<span><slot /></span>" },
	Button: { template: "<button v-bind='$attrs'><slot /></button>" },
	Input: { template: "<input v-bind='$attrs' :value='modelValue' @input=\"$emit('update:modelValue', $event.target.value)\" />", props: ["modelValue"], emits: ["update:modelValue"] },
	ScrollArea: { template: "<div><slot /></div>" },
	Select: SelectStub,
	SelectContent: { template: "<option disabled><slot /></option>" },
	SelectItem: { props: ["value"], template: "<option :value='value'><slot /></option>" },
	SelectTrigger: { template: "<span><slot /></span>" },
	SelectValue: true,
	FileText: true,
	FolderSearch: true,
	LoaderCircle: true,
	RefreshCcw: true,
	Search: true,
};

describe("WorkspaceSearchView", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
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

	it("searches and emits open-file for file results", async () => {
		const wrapper = mount(WorkspaceSearchView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await wrapper.find("input").setValue("alpha");
		await vi.advanceTimersByTimeAsync(200);
		await nextTick();

		expect(searchWorkspace).toHaveBeenCalledWith(expect.objectContaining({ q: "alpha" }));
		expect(wrapper.text()).toContain("alpha.md");

		await wrapper.findAll("button").find((button) => button.text().includes("alpha.md"))!.trigger("click");
		expect(wrapper.emitted("open-file")?.[0]).toEqual(["/workspace/笔记/alpha.md"]);
	});

	it("refreshes the selected RAG source and searches again", async () => {
		const wrapper = mount(WorkspaceSearchView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await wrapper.find("input").setValue("alpha");
		await vi.advanceTimersByTimeAsync(200);
		await nextTick();

		const refreshButtons = wrapper.findAll("button").filter((button) => !button.text().includes("alpha.md"));
		await refreshButtons[0]!.trigger("click");
		await nextTick();

		expect(refreshWorkspaceRag).toHaveBeenCalledWith("笔记/alpha.md");
		expect(searchWorkspace).toHaveBeenCalledTimes(2);
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
