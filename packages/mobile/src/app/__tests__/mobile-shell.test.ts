import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "@/app/App.vue";
import { mainNavItems, mobileRoutes } from "@/router/routes";

afterEach(() => {
  document.documentElement.className = "";
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("mobile shell route contract", () => {
  it("only exposes capture, chat, tasks, and mobile settings routes", () => {
    expect(mobileRoutes.map((route) => route.name)).toEqual([
      "capture",
      "chat",
      "tasks",
      "settings",
    ]);
    expect(mobileRoutes.map((route) => route.path)).toEqual([
      "/",
      "/chat",
      "/tasks",
      "/settings",
    ]);
  });

  it("keeps bottom navigation fixed to the three mobile main entries", () => {
    expect(mainNavItems.map((item) => item.routeName)).toEqual([
      "capture",
      "chat",
      "tasks",
    ]);
    expect(mainNavItems.map((item) => item.label)).toEqual([
      "捕捉",
      "对话",
      "任务",
    ]);
  });

  it("heartbeats with persisted Android registration when the app starts", async () => {
    window.localStorage.setItem(
      "ridge.mobile.serviceBaseUrl",
      "https://ridge.example.com",
    );
    window.localStorage.setItem(
      "ridge.mobile.deviceRegistration",
      JSON.stringify({
        deviceId: "android-shell",
        token: "rdt_shell_token",
        name: "Pixel",
      }),
    );
    const fetcher = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: mobileRoutes,
    });
    router.push("/");
    await router.isReady();

    mount(App, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();

    expect(fetcher).toHaveBeenCalledWith(
      "https://ridge.example.com/api/devices/heartbeat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceId: "android-shell",
          token: "rdt_shell_token",
        }),
      }),
    );
  });
});

describe("mobile shell navigation", () => {
  it("opens capture first and switches only between the three bottom entries", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: mobileRoutes,
    });
    router.push("/");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.find("[data-testid='capture-screen']").exists()).toBe(true);
    expect(wrapper.findAll("[data-testid='bottom-nav-item']")).toHaveLength(3);
    expect(wrapper.text()).not.toContain("工作台");
    expect(wrapper.text()).not.toContain("终端");
    expect(wrapper.text()).not.toContain("文件树");

    await wrapper.find("[data-testid='bottom-nav-item'][data-route='chat']").trigger("click");
    await router.isReady();
    await flushPromises();
    expect(wrapper.find("[data-testid='chat-screen']").exists()).toBe(true);

    await wrapper.find("[data-testid='bottom-nav-item'][data-route='tasks']").trigger("click");
    await router.isReady();
    await flushPromises();
    expect(wrapper.find("[data-testid='tasks-screen']").exists()).toBe(true);

    await wrapper.find("[data-testid='settings-entry']").trigger("click");
    await router.isReady();
    await flushPromises();
    expect(wrapper.find("[data-testid='settings-screen']").exists()).toBe(true);
  });
});
