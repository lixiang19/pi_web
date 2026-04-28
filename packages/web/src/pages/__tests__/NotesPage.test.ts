import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NotesPage from "@/pages/NotesPage.vue";
import type { NoteListItem } from "@/lib/types";

const { createNote, getNoteContent, listNotes, saveNoteContent } = vi.hoisted(() => ({
  createNote: vi.fn(),
  getNoteContent: vi.fn(),
  listNotes: vi.fn(),
  saveNoteContent: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createNote,
  getNoteContent,
  listNotes,
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
            emit("markdown-updated", (event.target as HTMLTextAreaElement).value);
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
    listNotes.mockResolvedValue({ root: "/workspace/chat", entries: [...baseNotes] });
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
  });

  it("loads the first note into the Obsidian-style workspace", async () => {
    const wrapper = mount(NotesPage);
    await flushPromises();

    expect(listNotes).toHaveBeenCalledOnce();
    expect(getNoteContent).toHaveBeenCalledWith("Alpha.md");
    expect(wrapper.findAll('[data-test="notes-list-item"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("笔记库");
    expect(wrapper.text()).toContain("Alpha.md");
    expect(wrapper.get('[data-test="notes-save"]').attributes("disabled")).toBeDefined();
  });

  it("filters notes, creates a note, and saves edited markdown", async () => {
    const wrapper = mount(NotesPage);
    await flushPromises();

    await wrapper.get('[data-test="notes-search"]').setValue("deep");
    expect(wrapper.findAll('[data-test="notes-list-item"]')).toHaveLength(1);
    expect(wrapper.text()).toContain("Deep.md");

    await wrapper.get('[data-test="notes-new-toggle"]').trigger("click");
    const createForm = wrapper.get('[data-test="notes-create-form"]');
    await createForm.find("input").setValue("New");
    await createForm.trigger("submit");
    await flushPromises();

    expect(createNote).toHaveBeenCalledWith("New");
    expect(getNoteContent).toHaveBeenCalledWith("New.md");

    await wrapper.get('[data-test="notes-editor"]').setValue("# changed");
    await wrapper.get('[data-test="notes-save"]').trigger("click");
    await flushPromises();

    expect(saveNoteContent).toHaveBeenCalledWith("New.md", "# changed");
  });
});
