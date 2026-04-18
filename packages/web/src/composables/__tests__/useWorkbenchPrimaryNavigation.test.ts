import { defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/lib/types";
import { useWorkbenchPrimaryNavigation } from "@/composables/useWorkbenchPrimaryNavigation";

const sessions = ref<SessionSummary[]>([]);
const info = ref<{ workspaceDir?: string } | null>(null);
const activeSessionId = ref<string | null>(null);
const routerPush = vi.fn(async () => undefined);
const getCachedSessionSnapshot = vi.fn();
const activateDraft = vi.fn();
const activateSession = vi.fn();

const routeName = ref("files");

vi.mock("vue-router", async () => {
  const actual = await vi.importActual<typeof import("vue-router")>("vue-router");

  return {
    ...actual,
    useRouter: () => ({
      push: routerPush,
    }),
    useRoute: () => ({
      name: routeName.value,
    }),
  };
});

vi.mock("@/composables/usePiChatCore", () => ({
  usePiChatCore: () => ({
    sessions,
    info,
    getCachedSessionSnapshot,
  }),
}));

vi.mock("@/composables/useSessionLruPool", () => ({
  useSessionLruPool: () => ({
    activeSessionId,
    activateDraft,
    activateSession,
  }),
}));

const Harness = defineComponent({
  setup() {
    return useWorkbenchPrimaryNavigation();
  },
  template: "<div />",
});

describe("useWorkbenchPrimaryNavigation", () => {
  beforeEach(() => {
    sessions.value = [];
    info.value = { workspaceDir: "/workspace" };
    activeSessionId.value = null;
    routeName.value = "files";
    routerPush.mockReset();
    getCachedSessionSnapshot.mockReset();
    activateDraft.mockReset();
    activateSession.mockReset();
  });

  it("navigates to chat before creating a draft and inherits cwd from the active session snapshot", async () => {
    activeSessionId.value = "session-1";
    getCachedSessionSnapshot.mockReturnValue({
      cwd: "/project/current",
    });

    const wrapper = mount(Harness);
    await wrapper.vm.createChat({});

    expect(routerPush).toHaveBeenCalledWith({ name: "chat" });
    expect(activateDraft).toHaveBeenCalledWith({
      cwd: "/project/current",
      parentSessionId: "",
    });
  });

  it("navigates to chat before activating a session from the unified sidebar", async () => {
    const wrapper = mount(Harness);

    await wrapper.vm.openChatSession("session-42");

    expect(routerPush).toHaveBeenCalledWith({ name: "chat" });
    expect(activateSession).toHaveBeenCalledWith("session-42");
  });

  it("exposes the expected primary navigation entries", async () => {
    const wrapper = mount(Harness);
    await nextTick();

    expect(wrapper.vm.primaryNavItems.map((item: { route: string }) => item.route)).toEqual([
      "search",
      "files",
      "terminal",
      "automations",
      "datasets",
      "spaces",
      "settings",
    ]);
  });
});
