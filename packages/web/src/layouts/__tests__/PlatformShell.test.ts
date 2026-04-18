import { defineComponent, onMounted } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import PlatformShell from "@/layouts/PlatformShell.vue";

const mountCounts = {
  chat: 0,
};

vi.mock("@/components/workbench/WorkbenchSidebar.vue", () => ({
  default: defineComponent({
    template: '<div data-test="workbench-sidebar" />',
  }),
}));

const ChatPage = defineComponent({
  name: "ChatPage",
  setup() {
    onMounted(() => {
      mountCounts.chat += 1;
    });

    return {};
  },
  template: '<div data-test="chat-page">chat</div>',
});

const SearchPage = defineComponent({
  name: "SearchPage",
  template: '<div data-test="search-page">search</div>',
});

describe("PlatformShell", () => {
  beforeEach(() => {
    mountCounts.chat = 0;
  });

  it("keeps the chat route alive when navigating away and back", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/",
          component: PlatformShell,
          children: [
            { path: "", redirect: "/chat" },
            { path: "chat", name: "chat", component: ChatPage },
            { path: "search", name: "search", component: SearchPage },
          ],
        },
      ],
    });

    router.push("/chat");
    await router.isReady();

    mount(PlatformShell, {
      global: {
        plugins: [router],
      },
    });

    expect(mountCounts.chat).toBe(1);

    await router.push("/search");
    await flushPromises();
    await router.push("/chat");
    await flushPromises();

    expect(mountCounts.chat).toBe(1);
  });
});
