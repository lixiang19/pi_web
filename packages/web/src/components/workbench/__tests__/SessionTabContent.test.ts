import { computed, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionTabContent from "@/components/workbench/SessionTabContent.vue";

const mockSessionId = ref("");
const mockStatus = ref<"idle" | "streaming" | "error">("idle");
const activateSession = vi.fn();
const promoteDraftToSession = vi.fn();
const setStreaming = vi.fn();

vi.mock("@/composables/useSessionLruPool", () => ({
  useSessionLruPool: () => ({
    activateSession,
    promoteDraftToSession,
    setStreaming,
  }),
}));

vi.mock("@/composables/usePerSessionChat", () => ({
  usePerSessionChat: () => ({
    sessionId: computed(() => mockSessionId.value),
    status: computed(() => mockStatus.value),
    activeSession: computed(() => null),
    activeDraftContext: ref(null),
    currentSessionTitle: computed(() => "新会话"),
    isDraftSession: computed(() => mockSessionId.value === ""),
    isSending: computed(() => mockStatus.value === "streaming"),
    messages: ref([]),
    hasMoreAbove: computed(() => false),
    isLoadingOlder: computed(() => false),
    interactiveRequests: computed(() => []),
    permissionRequests: computed(() => []),
    fileTreeRoot: computed(() => ""),
    composer: ref({
      draftText: "",
      isSending: false,
      canAbort: false,
      selectedModel: "",
      selectedThinkingLevel: "medium",
      selectedAgent: "",
      hasDraft: false,
      isFocused: false,
      isDisabled: false,
      pendingPrompt: "",
    }).value,
    core: {
      agents: ref([]),
      models: ref([]),
      resources: ref({
        prompts: [],
        skills: [],
        commands: [],
        diagnostics: {
          prompts: [],
          skills: [],
          commands: [],
        },
      }),
      refreshResources: vi.fn(),
      resourceError: ref(""),
    },
    openSessionDraft: vi.fn(),
    loadSession: vi.fn(),
    loadEarlier: vi.fn(),
    dismissPendingAsk: vi.fn(),
    respondToPendingAsk: vi.fn(),
    respondToPendingPermission: vi.fn(),
    setDraftProjectPath: vi.fn(),
    setSelectedAgent: vi.fn(),
    setSelectedModel: vi.fn(),
    setSelectedThinkingLevel: vi.fn(),
    submit: vi.fn(),
    abort: vi.fn(),
  }),
}));

describe("SessionTabContent", () => {
  beforeEach(() => {
    mockSessionId.value = "";
    mockStatus.value = "idle";
    activateSession.mockReset();
    promoteDraftToSession.mockReset();
    setStreaming.mockReset();
  });

  it("promotes a draft to a real session when chat.sessionId becomes available", async () => {
    mount(SessionTabContent, {
      props: {
        tabId: "__draft__",
        sessionId: "",
        initialCwd: "/tmp/project",
        initialParentSessionId: "",
      },
      global: {
        stubs: {
          WorkbenchChatPanel: true,
          ProjectFilePanel: true,
        },
      },
    });

    mockSessionId.value = "session-123";
    await nextTick();

    expect(promoteDraftToSession).toHaveBeenCalledWith("session-123");
  });
});
