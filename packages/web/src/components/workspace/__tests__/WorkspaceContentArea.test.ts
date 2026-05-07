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
		template: `<div data-test="readonly-preview" />`,
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
