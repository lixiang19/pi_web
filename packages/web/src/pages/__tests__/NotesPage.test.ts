import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import type { NoteListItem } from "@/lib/types";
import NotesPage from "@/pages/NotesPage.vue";

const {
	createNote,
	deleteNote,
	getNoteContent,
	listNotes,
	renameNote,
	saveNoteContent,
} = vi.hoisted(() => ({
	createNote: vi.fn(),
	deleteNote: vi.fn(),
	getNoteContent: vi.fn(),
	listNotes: vi.fn(),
	renameNote: vi.fn(),
	saveNoteContent: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
	createNote,
	deleteNote,
	getNoteContent,
	listNotes,
	renameNote,
	saveNoteContent,
}));

vi.mock("@/components/notes/NoteMilkdownEditor.vue", () => ({
	default: defineComponent({
		name: "NoteMilkdownEditor",
		props: {
			content: {
				type: String,
				required: true,
			},
		},
		emits: ["markdown-updated"],
		setup(props, { emit }) {
			return () =>
				h("textarea", {
					"data-test": "notes-editor",
					value: props.content,
					onInput: (event: Event) => {
						emit(
							"markdown-updated",
							(event.target as HTMLTextAreaElement).value,
						);
					},
				});
		},
	}),
}));

const baseNotes: NoteListItem[] = [
	{
		name: "Alpha.md",
		path: "/workspace/chat/Alpha.md",
		relativePath: "Alpha.md",
		size: 12,
		updatedAt: 1000,
	},
	{
		name: "Deep.md",
		path: "/workspace/chat/folder/Deep.md",
		relativePath: "folder/Deep.md",
		size: 24,
		updatedAt: 2000,
	},
];

describe("NotesPage", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		listNotes.mockResolvedValue({
			root: "/workspace/chat",
			entries: [...baseNotes],
		});
		getNoteContent.mockImplementation((path: string) =>
			Promise.resolve({
				path: `/workspace/chat/${path}`,
				relativePath: path,
				content: `# ${path}`,
				updatedAt: 3000,
				size: 20,
			}),
		);
		saveNoteContent.mockResolvedValue({
			path: "/workspace/chat/Alpha.md",
			relativePath: "Alpha.md",
			size: 18,
			updatedAt: 4000,
		});
		createNote.mockResolvedValue({
			name: "New.md",
			path: "/workspace/chat/New.md",
			relativePath: "New.md",
			size: 0,
			updatedAt: 5000,
		});
		deleteNote.mockResolvedValue({ deleted: true });
		renameNote.mockResolvedValue({
			oldPath: "Alpha.md",
			name: "Renamed.md",
			path: "/workspace/chat/Renamed.md",
			relativePath: "Renamed.md",
			size: 18,
			updatedAt: 6000,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads notes and opens the first note in a tab", async () => {
		const wrapper = mount(NotesPage);
		await flushPromises();

		expect(listNotes).toHaveBeenCalledOnce();
		expect(getNoteContent).toHaveBeenCalledWith("Alpha.md");
		expect(wrapper.findAll('[data-test="notes-list-item"]')).toHaveLength(2);
		expect(wrapper.text()).toContain("笔记");
	});

	it("filters notes and creates a new note", async () => {
		const wrapper = mount(NotesPage);
		await flushPromises();

		await wrapper.get('[data-test="notes-search"]').setValue("deep");
		expect(wrapper.findAll('[data-test="notes-list-item"]')).toHaveLength(1);

		await wrapper.get('[data-test="notes-new-toggle"]').trigger("click");
		const createForm = wrapper.get('[data-test="notes-create-form"]');
		await createForm.find("input").setValue("New");
		await createForm.trigger("submit");
		await flushPromises();

		expect(createNote).toHaveBeenCalledWith("New");
		expect(getNoteContent).toHaveBeenCalledWith("New.md");
	});

	it("auto-saves after 2 seconds of inactivity", async () => {
		const wrapper = mount(NotesPage);
		await flushPromises();

		await wrapper.get('[data-test="notes-editor"]').setValue("# changed");
		await flushPromises();

		// 还没保存
		expect(saveNoteContent).not.toHaveBeenCalled();

		// 等待 2 秒 debounce
		vi.advanceTimersByTime(2000);
		await flushPromises();

		expect(saveNoteContent).toHaveBeenCalled();
	});

	it("supports multiple tabs", async () => {
		const wrapper = mount(NotesPage);
		await flushPromises();

		// 默认打开了第一个笔记
		expect(wrapper.findAll('[data-test="note-tab"]')).toHaveLength(1);

		// 点击第二个笔记
		const items = wrapper.findAll('[data-test="notes-list-item"]');
		await items[1]!.trigger("click");
		await flushPromises();

		expect(wrapper.findAll('[data-test="note-tab"]')).toHaveLength(2);
	});
});
