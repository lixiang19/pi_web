import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilesRouteState } from "@/composables/useFilesRouteState";

const activeSessionId = { value: null as string | null };
const info = { value: { workspaceDir: "/workspace" } };
const sessions = {
  value: [] as Array<{
    id: string;
    cwd: string;
    projectRoot?: string;
    worktreeRoot?: string;
  }>,
};
const getCachedSessionSnapshot = vi.fn();

vi.mock("@/composables/usePiChatCore", () => ({
  usePiChatCore: () => ({
    info,
    sessions,
    getCachedSessionSnapshot,
  }),
}));

vi.mock("@/composables/useSessionLruPool", () => ({
  useSessionLruPool: () => ({
    activeSessionId,
  }),
}));

const Harness = defineComponent({
  setup() {
    return useFilesRouteState();
  },
  template: "<div />",
});

describe("useFilesRouteState", () => {
  beforeEach(() => {
    activeSessionId.value = null;
    info.value = { workspaceDir: "/workspace" };
    sessions.value = [];
    getCachedSessionSnapshot.mockReset();
  });

  it("prefers the active session worktree root when it differs from the project root", () => {
    activeSessionId.value = "session-1";
    getCachedSessionSnapshot.mockReturnValue({
      cwd: "/workspace/project/worktrees/feature",
      projectRoot: "/workspace/project",
      worktreeRoot: "/workspace/project/worktrees/feature",
    });

    const wrapper = mount(Harness);

    expect(wrapper.vm.rootDir).toBe("/workspace/project/worktrees/feature");
  });

  it("falls back to workspaceDir when there is no active session", () => {
    const wrapper = mount(Harness);

    expect(wrapper.vm.rootDir).toBe("/workspace");
  });
});
