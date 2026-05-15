import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceMarkdownEditor from "@/components/workspace/WorkspaceMarkdownEditor.vue";
import { getFilePreview, saveFileContent } from "@/lib/api";

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		getFilePreview: vi.fn(),
		saveFileContent: vi.fn(),
	};
});

vi.mock("vue-sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}));

vi.mock("@/components/workspace/NoteMilkdownEditor.vue", () => ({
	default: defineComponent({
		props: {
			content: { type: String, default: "" },
		},
		emits: ["markdownUpdated"],
		methods: {
			handleInput(event: Event) {
				this.$emit("markdownUpdated", (event.target as HTMLTextAreaElement).value);
			},
		},
		template: `<textarea data-test="milkdown" :value="content" @input="handleInput" />`,
	}),
}));

const mountEditor = async () => {
	const wrapper = mount(WorkspaceMarkdownEditor, {
		props: {
			filePath: "笔记/test.md",
			rootDir: "/workspace",
		},
	});
	await vi.waitFor(() => {
		expect(wrapper.find('[data-test="milkdown"]').exists()).toBe(true);
	});
	return wrapper;
};

describe("WorkspaceMarkdownEditor reliability", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(getFilePreview).mockResolvedValue({
			root: "/workspace",
			path: "/workspace/笔记/test.md",
			name: "test.md",
			extension: ".md",
			mimeType: "text/markdown",
			previewKind: "markdown",
			content: "old content",
			size: 11,
			isLargeFile: false,
			readOnly: false,
		});
		vi.mocked(saveFileContent).mockResolvedValue({
			root: "/workspace",
			path: "/workspace/笔记/test.md",
			size: 11,
			savedAt: 2,
		});
	});

	it("emits visible save states from unsaved to saving to saved", async () => {
		const wrapper = await mountEditor();

		await wrapper.get('[data-test="milkdown"]').setValue("new content");
		expect(wrapper.emitted("update:save-status")?.at(-1)).toEqual(["unsaved"]);
		expect(wrapper.get('[data-test="save-status"]').text()).toContain("未保存");

		await vi.advanceTimersByTimeAsync(2000);
		await vi.waitFor(() => {
			expect(saveFileContent).toHaveBeenCalledWith({
				root: "/workspace",
				path: "笔记/test.md",
				content: "new content",
			});
		});
		expect(wrapper.emitted("update:save-status")?.map((item) => item[0])).toContain("saving");
		expect(wrapper.emitted("update:save-status")?.at(-1)).toEqual(["saved"]);
		expect(wrapper.get('[data-test="save-status"]').text()).toContain("已保存");
	});

	it("shows save errors, keeps edited content, and retries save", async () => {
		vi.mocked(saveFileContent)
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValueOnce({ root: "/workspace", path: "/workspace/笔记/test.md", size: 13, savedAt: 3 });
		const wrapper = await mountEditor();

		await wrapper.get('[data-test="milkdown"]').setValue("draft content");
		await vi.advanceTimersByTimeAsync(2000);
		await vi.waitFor(() => {
			expect(wrapper.get('[data-test="save-error"]').text()).toContain("disk full");
		});
		expect((wrapper.get('[data-test="milkdown"]').element as HTMLTextAreaElement).value).toBe("draft content");
		expect(wrapper.emitted("update:save-status")?.at(-1)).toEqual(["error"]);

		await wrapper.get('[data-test="retry-save"]').trigger("click");
		await vi.waitFor(() => {
			expect(saveFileContent).toHaveBeenCalledWith({
				root: "/workspace",
				path: "笔记/test.md",
				content: "draft content",
			});
		});
		expect(saveFileContent).toHaveBeenLastCalledWith({
			root: "/workspace",
			path: "笔记/test.md",
			content: "draft content",
		});
		expect(wrapper.emitted("update:save-status")?.at(-1)).toEqual(["saved"]);
	});

	it("flushes pending unsaved content on unmount", async () => {
		const wrapper = await mountEditor();
		await wrapper.get('[data-test="milkdown"]').setValue("pending content");
		wrapper.unmount();
		await vi.waitFor(() => {
			expect(saveFileContent).toHaveBeenCalledWith({
				root: "/workspace",
				path: "笔记/test.md",
				content: "pending content",
			});
		});
	});
});
