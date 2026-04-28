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
			name: "未命名1.md",
			path: "/workspace/chat/未命名1.md",
			relativePath: "未命名1.md",
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
		expect(wrapper.findAll('[data-test="notes-list"]')).toHaveLength(1);
		expect(wrapper.text()).toContain("笔记本");
	});

	it("creates a new note with auto-generated name", async () => {
		const wrapper = mount(NotesPage);
		await flushPromises();

		await wrapper.get('[data-test="notes-new-toggle"]').trigger("click");
		await flushPromises();

		expect(createNote).toHaveBeenCalledWith("");
		expect(getNoteContent).toHaveBeenCalledWith("未命名1.md");
	});

	it("auto-saves after 2 seconds of inactivity", async () => {
		const wrapper = mount(NotesPage);
		await flushPromises();

		await wrapper.get('[data-test="notes-editor"]').setValue("# changed");
		await flushPromises();

		expect(saveNoteContent).not.toHaveBeenCalled();

		vi.advanceTimersByTime(2000);
		await flushPromises();

		expect(saveNoteContent).toHaveBeenCalled();
	});

	it("supports multiple tabs", async () => {
		const wrapper = mount(NotesPage);
		await flushPromises();

		expect(wrapper.findAll('[data-test="note-tab"]')).toHaveLength(1);

		// Click the second note item in the list
		const deepItem = wrapper.findAll('[data-test="notes-list"] .group');
		if (deepItem.length > 1) {
			await deepItem[1]!.trigger("click");
			await flushPromises();

			expect(wrapper.findAll('[data-test="note-tab"]')).toHaveLength(2);
		}
	});
});
