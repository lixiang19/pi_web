import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/features/settings/SettingsPage.vue";
import { MOBILE_SERVICE_URL_STORAGE_KEY } from "@/lib/api/mobile-api-client";
import { MOBILE_DEVICE_REGISTRATION_STORAGE_KEY } from "@/lib/device/device-storage";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("SettingsPage Android service connection", () => {
  it("saves the ridge service URL and registers the Android device", async () => {
    const fetcher = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          deviceId: "android-settings",
          name: "Android Device",
          deviceType: "android",
          token: "rdt_settings_token",
          capabilities: {
            mobile_capture: true,
            camera: true,
            microphone: true,
          },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const wrapper = mount(SettingsPage);

    await wrapper
      .find("[data-testid='service-url-input']")
      .setValue("https://ridge.example.com/");
    await wrapper.find("[data-testid='register-device-button']").trigger("click");
    await flushPromises();

    expect(window.localStorage.getItem(MOBILE_SERVICE_URL_STORAGE_KEY)).toBe(
      "https://ridge.example.com",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://ridge.example.com/api/devices/register",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"deviceType":"android"'),
      }),
    );
    expect(
      JSON.parse(
        window.localStorage.getItem(MOBILE_DEVICE_REGISTRATION_STORAGE_KEY) ?? "{}",
      ),
    ).toMatchObject({
      deviceId: "android-settings",
      token: "rdt_settings_token",
      name: "Android Device",
    });
    expect(wrapper.text()).toContain("已连接");
  });
});
