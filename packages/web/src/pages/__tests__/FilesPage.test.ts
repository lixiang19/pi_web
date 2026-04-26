import { computed, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import FilesPage from "@/pages/FilesPage.vue";

const openFile = vi.fn();

vi.mock("@/composables/useFilesRouteState", () => ({
  useFilesRouteState: () => ({
    projectLabel: computed(() => "ridge-workspace"),
    rootDir: computed(() => "/workspace"),
  }),
}));

vi.mock("@/components/WorkspaceFileTree.vue", () => ({
  default: defineComponent({
    name: "WorkspaceFileTree",
    props: {
      rootDir: {
        type: String,
        required: true,
      },
    },
    emits: ["select-file"],
    setup(props) {
      return () => h("button", { type: "button" }, props.rootDir);
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

describe("FilesPage", () => {
  it("opens selected workspace files in the preview panel", async () => {
    openFile.mockReset();

    const wrapper = mount(FilesPage);
    const tree = wrapper.findComponent({ name: "WorkspaceFileTree" });
    const preview = wrapper.findComponent({ name: "WorkbenchOperationPanel" });

    expect(tree.props("rootDir")).toBe("/workspace");
    expect(preview.props("enableMarkdownAiActions")).toBe(false);

    await tree.vm.$emit("select-file", "/workspace/docs/readme.md");

    expect(openFile).toHaveBeenCalledWith("/workspace/docs/readme.md");
    expect(wrapper.text()).toContain("docs/readme.md");
  });
});
