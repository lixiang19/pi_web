import { computed, defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import WorkbenchSidebar from "@/components/workbench/WorkbenchSidebar.vue";

const sessions = ref([]);
const sessionContexts = ref({});
const storedProjects = ref([
  {
    id: "project-1",
    name: "alpha",
    path: "/workspace/alpha",
    addedAt: 1,
    isGit: true,
  },
]);

vi.mock("@vueuse/core", async () => {
  const actual = await vi.importActual<typeof import("@vueuse/core")>("@vueuse/core");

  return {
    ...actual,
    useLocalStorage: () => ref({}),
  };
});

vi.mock("@/composables/usePiChatCore", () => ({
  usePiChatCore: () => ({
    sessions,
    sessionContexts,
    info: ref({
      workspaceDir: "/workspace",
      chatProjectId: "ridge:workspace-chat",
      chatProjectPath: "/workspace/chat",
      chatProjectLabel: "聊天",
    }),
    prefetchSession: vi.fn(),
    renameSessionTitle: vi.fn(),
    removeSessionTree: vi.fn(async () => ({ sessionIds: [] })),
  }),
}));

vi.mock("@/composables/useSessionLruPool", () => ({
  useSessionLruPool: () => ({
    activeSessionId: computed(() => null),
    isViewingDraft: computed(() => false),
    removeSession: vi.fn(),
  }),
}));

vi.mock("@/composables/useWorkbenchPrimaryNavigation", () => ({
  newChatNavItem: { label: "新聊天", icon: defineComponent({ template: "<i />" }) },
  useWorkbenchPrimaryNavigation: () => ({
    activeRoute: computed(() => "chat"),
    isChatRoute: computed(() => true),
    primaryNavItems: [
      { route: "search", label: "搜索", icon: defineComponent({ template: "<i />" }) },
      { route: "files", label: "文件", icon: defineComponent({ template: "<i />" }) },
      { route: "terminal", label: "终端", icon: defineComponent({ template: "<i />" }) },
      { route: "automations", label: "自动化", icon: defineComponent({ template: "<i />" }) },
      { route: "settings", label: "设置", icon: defineComponent({ template: "<i />" }) },
    ],
    navigateToRoute: vi.fn(),
    createChat: vi.fn(),
    openChatSession: vi.fn(),
  }),
}));

vi.mock("@/composables/useProjects", () => ({
  useProjects: () => ({
    add: vi.fn(),
    error: ref(""),
    isLoading: ref(false),
    load: vi.fn(async () => storedProjects.value),
    projects: storedProjects,
  }),
}));

vi.mock("@/composables/useProjectWorktrees", () => ({
  useProjectWorktrees: () => ({
    worktreesByProject: ref({}),
    refresh: vi.fn(),
    loadAll: vi.fn(),
  }),
}));

vi.mock("@/lib/session-sidebar", () => ({
  buildSidebarProjects: () => ({
    workspaceChatProject: {
      id: "ridge:workspace-chat",
      label: "聊天",
      projectRoot: "/workspace/chat",
      pathLabel: "chat",
      lastUpdatedAt: 1,
      sessions: [],
      groups: [],
      isGit: false,
      source: "workspace-chat",
    },
    projects: [
      {
        id: "project-1",
        label: "alpha",
        projectRoot: "/workspace/alpha",
        pathLabel: "alpha",
        lastUpdatedAt: 1,
        sessions: [],
        groups: [],
        isGit: true,
        source: "stored-project",
      },
    ],
  }),
}));

vi.mock("@/components/chat/SessionSidebarSessionNode.vue", () => ({
  default: defineComponent({
    template: '<div data-test="session-node" />',
  }),
}));

vi.mock("@/components/chat/ProjectSelectorDialog.vue", () => ({
  default: defineComponent({ template: "<div />" }),
}));

vi.mock("@/components/chat/NewWorktreeDialog.vue", () => ({
  default: defineComponent({ template: "<div />" }),
}));

vi.mock("@/components/chat/DeleteWorktreeDialog.vue", () => ({
  default: defineComponent({ template: "<div />" }),
}));

describe("WorkbenchSidebar", () => {
  it("uses a compact project-focused layout without the old header and session search input", () => {
    const wrapper = mount(WorkbenchSidebar, {
      global: {
        stubs: {
          Tooltip: defineComponent({ template: "<div><slot /></div>" }),
          TooltipTrigger: defineComponent({ template: "<div><slot /></div>" }),
          TooltipContent: defineComponent({ template: "<div><slot /></div>" }),
        },
      },
    });

    expect(wrapper.text()).toContain("项目");
    expect(wrapper.text()).toContain("聊天");
    expect(wrapper.text()).toContain("设置");
    expect(wrapper.text()).not.toContain("ridge");
    expect(wrapper.html()).not.toContain("搜索会话");
  });
});
