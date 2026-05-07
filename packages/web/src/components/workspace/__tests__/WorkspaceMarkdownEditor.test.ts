import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceMarkdownEditor from "@/components/workspace/WorkspaceMarkdownEditor.vue";
import { getNoteContent, saveNoteContent } from "@/lib/api";

vi.mock("@/lib/api", async () => {
	const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
	return {
		...actual,
		getNoteContent: vi.fn(),
		saveNoteContent: vi.fn(),
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
		vi.mocked(getNoteContent).mockResolvedValue({
			path: "笔记/test.md",
			relativePath: "笔记/test.md",
			content: "old content",
			updatedAt: 1,
			size: 11,
		});
		vi.mocked(saveNoteContent).mockResolvedValue({
			path: "笔记/test.md",
			relativePath: "笔记/test.md",
			size: 11,
			updatedAt: 2,
		});
	});

	it("emits visible save states from unsaved to saving to saved", async () => {
		const wrapper = await mountEditor();

		await wrapper.get('[data-test="milkdown"]').setValue("new content");
		expect(wrapper.emitted("update:save-status")?.at(-1)).toEqual(["unsaved"]);
		expect(wrapper.get('[data-test="save-status"]').text()).toContain("未保存");

		await vi.advanceTimersByTimeAsync(2000);
		await vi.waitFor(() => {
			expect(saveNoteContent).toHaveBeenCalledWith("笔记/test.md", "new content");
		});
		expect(wrapper.emitted("update:save-status")?.map((item) => item[0])).toContain("saving");
		expect(wrapper.emitted("update:save-status")?.at(-1)).toEqual(["saved"]);
		expect(wrapper.get('[data-test="save-status"]').text()).toContain("已保存");
	});

	it("shows save errors, keeps edited content, and retries save", async () => {
		vi.mocked(saveNoteContent)
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValueOnce({ path: "笔记/test.md", relativePath: "笔记/test.md", size: 13, updatedAt: 3 });
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
			expect(saveNoteContent).toHaveBeenCalledWith("笔记/test.md", "draft content");
		});
		expect(saveNoteContent).toHaveBeenLastCalledWith("笔记/test.md", "draft content");
		expect(wrapper.emitted("update:save-status")?.at(-1)).toEqual(["saved"]);
	});

	it("flushes pending unsaved content on unmount", async () => {
		const wrapper = await mountEditor();
		await wrapper.get('[data-test="milkdown"]').setValue("pending content");
		wrapper.unmount();
		await vi.waitFor(() => {
			expect(saveNoteContent).toHaveBeenCalledWith("笔记/test.md", "pending content");
		});
	});
});
