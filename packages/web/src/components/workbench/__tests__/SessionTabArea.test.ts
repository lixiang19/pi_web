import { computed, defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionTabArea from "@/components/workbench/SessionTabArea.vue";

const pool = ref<{ sessionId: string; lastAccessedAt: number; isStreaming: boolean }[]>([]);
const activeSessionId = ref<string | null>(null);
const draftView = ref<{
  key: string;
  cwd: string;
  parentSessionId: string;
  sessionId?: string;
} | null>(null);

vi.mock("@/composables/useSessionLruPool", () => ({
  useSessionLruPool: () => ({
    pool,
    draftView: computed(() => draftView.value),
    activeSessionId: computed(() => activeSessionId.value),
    isViewingDraft: computed(() => draftView.value !== null && !draftView.value.sessionId),
    currentViewId: computed(() => draftView.value?.key ?? activeSessionId.value),
  }),
}));

vi.mock("@/components/workbench/SessionTabContent.vue", () => ({
  default: defineComponent({
    props: {
      sessionId: { type: String, default: "" },
    },
    template: `<div data-test="session-tab-content">{{ sessionId || "__draft__" }}</div>`,
  }),
}));

describe("SessionTabArea", () => {
  beforeEach(() => {
    pool.value = [];
    activeSessionId.value = null;
    draftView.value = null;
  });

  it("renders welcome state when there is no draft and no pooled session", () => {
    const wrapper = mount(SessionTabArea, {
      global: {
        stubs: {
          WelcomeEmptyState: { template: `<div data-test="welcome" />` },
        },
      },
    });

    expect(wrapper.find('[data-test="welcome"]').exists()).toBe(true);
  });

  it("keeps pooled session contents mounted and switches visibility with v-show", () => {
    pool.value = [
      { sessionId: "session-2", lastAccessedAt: 2, isStreaming: false },
      { sessionId: "session-1", lastAccessedAt: 1, isStreaming: false },
    ];
    activeSessionId.value = "session-2";

    const wrapper = mount(SessionTabArea);

    expect(wrapper.findAll('[data-test="session-tab-content"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("session-1");
    expect(wrapper.text()).toContain("session-2");
  });

  it("reuses the promoted draft instance instead of rendering a duplicate pooled session", () => {
    draftView.value = {
      key: "draft-1",
      cwd: "/tmp/project",
      parentSessionId: "",
      sessionId: "session-2",
    };
    pool.value = [
      { sessionId: "session-2", lastAccessedAt: 2, isStreaming: false },
      { sessionId: "session-1", lastAccessedAt: 1, isStreaming: false },
    ];
    activeSessionId.value = "session-2";

    const wrapper = mount(SessionTabArea);

    const rendered = wrapper
      .findAll('[data-test="session-tab-content"]')
      .map((node) => node.text());

    expect(rendered).toEqual(["session-2", "session-1"]);
  });

  it("uses a single layout stage when a draft and pooled sessions coexist", () => {
    draftView.value = {
      key: "draft-1",
      cwd: "/tmp/project",
      parentSessionId: "",
    };
    pool.value = [
      { sessionId: "session-2", lastAccessedAt: 2, isStreaming: false },
      { sessionId: "session-1", lastAccessedAt: 1, isStreaming: false },
    ];
    activeSessionId.value = null;

    const wrapper = mount(SessionTabArea);

    expect(wrapper.findAll('[data-test="session-tab-stage"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-test="session-tab-content"]')).toHaveLength(3);
  });
});
