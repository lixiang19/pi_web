import { computed, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import FilesPage from "@/pages/FilesPage.vue";
import type { FileTreeEntry } from "@/lib/types";

const openFile = vi.fn();

const entries: FileTreeEntry[] = [
  {
    name: "docs",
    path: "/workspace/docs",
    kind: "directory",
    relativePath: "docs",
    size: null,
    modifiedAt: 100,
    extension: "",
  },
  {
    name: "README.md",
    path: "/workspace/README.md",
    kind: "file",
    relativePath: "README.md",
    size: 12,
    modifiedAt: 200,
    extension: ".md",
  },
];

const apiMocks = vi.hoisted(() => ({
  createFileEntry: vi.fn(),
  getFileTree: vi.fn(),
  moveFileEntry: vi.fn(),
  trashFileEntry: vi.fn(),
  uploadFiles: vi.fn(),
}));

vi.mock("@/lib/api", () => apiMocks);

vi.mock("@/composables/useFilesRouteState", () => ({
  useFilesRouteState: () => ({
    projectLabel: computed(() => "ridge-workspace"),
    rootDir: computed(() => "/workspace"),
  }),
}));

vi.mock("@/components/files/FileBreadcrumbs.vue", () => ({
  default: defineComponent({
    name: "FileBreadcrumbs",
    props: {
      items: {
        type: Array,
        required: true,
      },
    },
    emits: ["navigate"],
    setup(props) {
      return () => h("nav", props.items.length);
    },
  }),
}));

vi.mock("@/components/files/FileManagerToolbar.vue", () => ({
  default: defineComponent({
    name: "FileManagerToolbar",
    emits: ["create-file", "create-folder", "refresh", "upload"],
    setup() {
      return () => h("div", "toolbar");
    },
  }),
}));

vi.mock("@/components/files/FileGrid.vue", () => ({
  default: defineComponent({
    name: "FileGrid",
    props: {
      entries: {
        type: Array,
        required: true,
      },
      isLoading: {
        type: Boolean,
        required: true,
      },
      activePath: {
        type: String,
        required: true,
      },
    },
    emits: ["open", "rename", "trash", "move"],
    setup(props, { emit }) {
      return () =>
        h(
          "div",
          { "data-loading": String(props.isLoading) },
          (props.entries as FileTreeEntry[]).map((entry) =>
            h(
              "button",
              {
                type: "button",
                onClick: () => emit("open", entry),
              },
              entry.name,
            ),
          ),
        );
    },
  }),
}));

vi.mock("@/components/files/FileEntryDialog.vue", () => ({
  default: defineComponent({
    name: "FileEntryDialog",
    setup() {
      return () => null;
    },
  }),
}));

vi.mock("@/components/files/FileTrashDialog.vue", () => ({
  default: defineComponent({
    name: "FileTrashDialog",
    setup() {
      return () => null;
    },
  }),
}));

vi.mock("@/components/workbench/WorkbenchOperationPanel.vue", () => ({
  default: defineComponent({
    name: "WorkbenchOperationPanel",
    props: {
      rootDir: {
        type: String,
        required: true,
      },
      enableMarkdownAiActions: {
        type: Boolean,
        default: true,
      },
      emptyTitle: {
        type: String,
        required: true,
      },
      emptyDescription: {
        type: String,
        required: true,
      },
    },
    setup(props, { expose }) {
      expose({ openFile });
      return () => h("section", { "data-ai-actions": String(props.enableMarkdownAiActions) });
    },
  }),
}));

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("FilesPage", () => {
  it("loads workspace entries into the grid", async () => {
    apiMocks.getFileTree.mockResolvedValue({
      root: "/workspace",
      directory: "/workspace",
      entries,
    });

    const wrapper = mount(FilesPage);
    await flushPromises();

    const grid = wrapper.findComponent({ name: "FileGrid" });
    expect(grid.props("entries")).toEqual(entries);
    expect(wrapper.text()).toContain("README.md");
  });

  it("opens folders in the manager and files in the preview panel", async () => {
    apiMocks.getFileTree
      .mockResolvedValueOnce({
        root: "/workspace",
        directory: "/workspace",
        entries,
      })
      .mockResolvedValueOnce({
        root: "/workspace",
        directory: "/workspace/docs",
        entries: [],
      });
    openFile.mockReset();

    const wrapper = mount(FilesPage);
    await flushPromises();

    const buttons = wrapper.findAll("button");
    expect(buttons[0]).toBeDefined();
    expect(buttons[1]).toBeDefined();

    await buttons[1]!.trigger("click");
    expect(openFile).toHaveBeenCalledWith("/workspace/README.md");
    expect(wrapper.text()).toContain("README.md");

    await buttons[0]!.trigger("click");
    expect(apiMocks.getFileTree).toHaveBeenLastCalledWith(
      "/workspace/docs",
      "/workspace",
    );
  });
});
