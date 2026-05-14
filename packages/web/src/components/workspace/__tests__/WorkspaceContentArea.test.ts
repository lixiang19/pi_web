import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import WorkspaceContentArea from "@/components/workspace/WorkspaceContentArea.vue";
import type { WorkspaceFileTab } from "@/composables/useWorkspaceFilePreview";

vi.mock("@/components/workspace/WorkspaceMarkdownEditor.vue", () => ({
	default: {
		name: "WorkspaceMarkdownEditor",
		template: `<div data-test="markdown-editor" />`,
	},
}));

vi.mock("@/components/workbench/file-preview/WorkbenchReadonlyFilePreview.vue", () => ({
	default: {
		name: "WorkbenchReadonlyFilePreview",
		props: ["blobUrl"],
		template: `<div data-test="readonly-preview" :data-blob="blobUrl" />`,
	},
}));

vi.mock("@/components/workspace/OpenWithDefaultApp.vue", () => ({
	default: {
		name: "OpenWithDefaultApp",
		props: ["fileName", "filePath"],
		template: `<div data-test="open-with-default" />`,
	},
}));

const createTab = (overrides: Partial<WorkspaceFileTab>): WorkspaceFileTab => ({
	id: "/workspace/笔记/test.md",
	path: "/workspace/笔记/test.md",
	root: "/workspace",
	title: "test.md",
	extension: ".md",
	mimeType: "text/markdown",
	previewKind: "markdown",
	content: "",
	isLoading: false,
	error: "",
	isLargeFile: false,
	previewLineCount: 0,
	nextStartLine: null,
	isLoadingMore: false,
	...overrides,
});

describe("WorkspaceContentArea markdown routing", () => {
	it("renders markdown editor only for markdown tabs", () => {
		const wrapper = mount(WorkspaceContentArea, {
			props: { tab: createTab({}), rootDir: "/workspace" },
		});
		expect(wrapper.find('[data-test="markdown-editor"]').exists()).toBe(true);
		expect(wrapper.find('[data-test="readonly-preview"]').exists()).toBe(false);
	});

	it("does not render markdown editor for non-markdown text tabs", () => {
		const wrapper = mount(WorkspaceContentArea, {
			props: {
				tab: createTab({
					id: "/workspace/readme.txt",
					path: "/workspace/readme.txt",
					title: "readme.txt",
					extension: ".txt",
					mimeType: "text/plain",
					previewKind: "text",
				}),
				rootDir: "/workspace",
			},
		});
		expect(wrapper.find('[data-test="markdown-editor"]').exists()).toBe(false);
		expect(wrapper.find('[data-test="readonly-preview"]').exists()).toBe(true);
	});
});

describe("WorkspaceContentArea audio routing", () => {
	it("generates blobUrl for audio preview tabs", () => {
		const wrapper = mount(WorkspaceContentArea, {
			props: {
				tab: createTab({
					id: "/workspace/audio.mp3",
					path: "/workspace/audio.mp3",
					title: "audio.mp3",
					extension: ".mp3",
					mimeType: "audio/mpeg",
					previewKind: "audio",
				}),
				rootDir: "/workspace",
			},
		});
		const readonly = wrapper.find('[data-test="readonly-preview"]');
		expect(readonly.exists()).toBe(true);
		expect(readonly.attributes("data-blob")).toContain("/api/files/blob");
		expect(readonly.attributes("data-blob")).toContain("audio.mp3");
	});

	it("does not generate blobUrl for unsupported preview kinds", () => {
		const wrapper = mount(WorkspaceContentArea, {
			props: {
				tab: createTab({
					id: "/workspace/data.bin",
					path: "/workspace/data.bin",
					title: "data.bin",
					extension: ".bin",
					mimeType: "application/octet-stream",
					previewKind: "unsupported",
				}),
				rootDir: "/workspace",
			},
		});
		// Unsupported files render OpenWithDefaultApp, not the readonly preview
		expect(wrapper.find('[data-test="readonly-preview"]').exists()).toBe(false);
		expect(wrapper.find('[data-test="open-with-default"]').exists()).toBe(true);
	});
});
