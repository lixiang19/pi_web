import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/lib/types";
import WorkbenchPage from "@/pages/WorkbenchPage.vue";

const sessions = ref<SessionSummary[]>([]);
const sessionContexts = ref({});
const info = ref<{ workspaceDir?: string } | null>(null);
const activateDraft = vi.fn();
const activateSession = vi.fn();
const removeSession = vi.fn();
const prefetchSession = vi.fn();
const renameSessionTitle = vi.fn();
const setSessionArchived = vi.fn();
const removeSessionTree = vi.fn(async () => ({ sessionIds: [] }));
const activeSessionId = ref<string | null>(null);

vi.mock("@/composables/usePiChatCore", () => ({
  usePiChatCore: () => ({
    sessions,
    sessionContexts,
    info,
    prefetchSession,
    renameSessionTitle,
    setSessionArchived,
    removeSessionTree,
  }),
}));

vi.mock("@/composables/useSessionLruPool", () => ({
  useSessionLruPool: () => ({
    activeSessionId,
    activateDraft,
    activateSession,
    removeSession,
  }),
}));

vi.mock("@/components/workbench/SessionTabArea.vue", () => ({
  default: defineComponent({
    template: `<div data-test="tab-area" />`,
  }),
}));

vi.mock("@/components/chat/SessionSidebar.vue", () => ({
  default: defineComponent({
    emits: ["create"],
    template: `<button data-test="create" @click="$emit('create', {})">create</button>`,
  }),
}));

describe("WorkbenchPage", () => {
  beforeEach(() => {
    sessions.value = [];
    sessionContexts.value = {};
    info.value = { workspaceDir: "/workspace" };
    activeSessionId.value = null;
    activateDraft.mockReset();
    activateSession.mockReset();
    removeSession.mockReset();
    prefetchSession.mockReset();
    renameSessionTitle.mockReset();
    setSessionArchived.mockReset();
    removeSessionTree.mockClear();
  });

  it("inherits cwd from the current active session before falling back to workspaceDir", async () => {
    sessions.value = [
      {
        id: "session-1",
        title: "Current",
        cwd: "/project/current",
        status: "idle",
        updatedAt: Date.now(),
      } as SessionSummary,
    ];
    activeSessionId.value = "session-1";

    const wrapper = mount(WorkbenchPage);
    await wrapper.get('[data-test="create"]').trigger("click");

    expect(activateDraft).toHaveBeenCalledWith({
      cwd: "/project/current",
      parentSessionId: "",
    });
  });
});
