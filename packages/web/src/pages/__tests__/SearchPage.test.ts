import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "@/pages/SearchPage.vue";

const { openChatSession } = vi.hoisted(() => ({
  openChatSession: vi.fn(),
}));

vi.mock("@/composables/usePiChatCore", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");

  return {
    usePiChatCore: () => ({
      sessions: ref([
        {
          id: "session-1",
          title: "设计评审",
          cwd: "/workspace/chat",
          status: "idle",
          createdAt: 100,
          updatedAt: 100,
          archived: false,
          sessionFile: "/workspace/chat/session-1.json",
          projectLabel: "聊天",
          worktreeLabel: "聊天",
        },
        {
          id: "session-2",
          title: "搜索功能设计",
          cwd: "/workspace/alpha",
          status: "idle",
          createdAt: 200,
          updatedAt: 300,
          archived: false,
          sessionFile: "/workspace/alpha/session-2.json",
          projectLabel: "alpha",
          worktreeLabel: "main",
        },
        {
          id: "session-3",
          title: "发布记录",
          cwd: "/workspace/beta",
          status: "idle",
          createdAt: 300,
          updatedAt: 200,
          archived: true,
          sessionFile: "/workspace/beta/session-3.json",
          projectLabel: "beta",
          worktreeLabel: "release",
        },
      ]),
      info: ref({
        workspaceDir: "/workspace",
      }),
    }),
  };
});

vi.mock("@/composables/useWorkbenchPrimaryNavigation", () => ({
  useWorkbenchPrimaryNavigation: () => ({
    openChatSession,
  }),
}));

describe("SearchPage", () => {
  beforeEach(() => {
    openChatSession.mockReset();
  });

  it("only searches after submit and opens the newest matching session", async () => {
    const wrapper = mount(SearchPage);

    await wrapper.get("input").setValue("设计");

    expect(wrapper.findAll('[data-test="search-result"]')).toHaveLength(0);
    expect(wrapper.get('[data-test="search-idle"]').text()).toContain("搜索只匹配会话标题");

    await wrapper.get('[data-test="search-form"]').trigger("submit");

    const results = wrapper.findAll('[data-test="search-result"]');
    const firstResult = results[0]!;
    const secondResult = results[1]!;

    expect(results).toHaveLength(2);
    expect(firstResult.text()).toContain("搜索功能设计");
    expect(secondResult.text()).toContain("设计评审");

    await firstResult.trigger("click");

    expect(openChatSession).toHaveBeenCalledWith("session-2");
  });

  it("includes archived sessions and shows the empty state when nothing matches", async () => {
    const wrapper = mount(SearchPage);

    await wrapper.get("input").setValue("发布");
    await wrapper.get('[data-test="search-form"]').trigger("submit");

    const archivedResult = wrapper.get('[data-test="search-result"]');
    expect(archivedResult.text()).toContain("发布记录");
    expect(archivedResult.text()).toContain("归档");

    await wrapper.get("input").setValue("不存在");
    await wrapper.get('[data-test="search-form"]').trigger("submit");

    expect(wrapper.findAll('[data-test="search-result"]')).toHaveLength(0);
    expect(wrapper.get('[data-test="search-empty"]').text()).toContain("不存在");
  });
});