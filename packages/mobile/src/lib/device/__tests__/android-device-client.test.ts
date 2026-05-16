import { describe, expect, it, vi } from "vitest";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import { createAndroidDeviceClient } from "@/lib/device/android-device-client";
import { createDeviceStorage } from "@/lib/device/device-storage";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Android device client", () => {
  it("does not register when the ridge service address is missing", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createMobileApiClient({ fetcher });
    const client = createAndroidDeviceClient({
      api,
      storage: createDeviceStorage(),
      getDeviceName: () => "Pixel",
      createDeviceId: () => "android-test",
    });

    await expect(client.register()).rejects.toMatchObject({
      code: "MOBILE_SERVICE_URL_MISSING",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("persists the first Android token and heartbeats with it after restart", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === "https://ridge.example.com/api/devices/register") {
        expect(init).toBeDefined();
        const requestInit = init as RequestInit;
        expect(requestInit.method).toBe("POST");
        expect(JSON.parse(String(requestInit.body))).toMatchObject({
          deviceId: "android-test",
          name: "Pixel",
          deviceType: "android",
          capabilities: {
            mobile_capture: true,
            camera: true,
            microphone: true,
          },
        });
        return jsonResponse(
          {
            deviceId: "android-test",
            name: "Pixel",
            deviceType: "android",
            token: "rdt_first_token",
            capabilities: {
              mobile_capture: true,
              camera: true,
              microphone: true,
            },
          },
          { status: 201 },
        );
      }

      if (String(input) === "https://ridge.example.com/api/devices/heartbeat") {
        expect(init).toBeDefined();
        const requestInit = init as RequestInit;
        expect(requestInit.method).toBe("POST");
        expect(JSON.parse(String(requestInit.body))).toEqual({
          deviceId: "android-test",
          token: "rdt_first_token",
        });
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: "unexpected request" }, { status: 500 });
    });
    const api = createMobileApiClient({ fetcher });
    api.setServiceBaseUrl("https://ridge.example.com");
    const storage = createDeviceStorage();
    const firstClient = createAndroidDeviceClient({
      api,
      storage,
      getDeviceName: () => "Pixel",
      createDeviceId: () => "android-test",
    });

    const registration = await firstClient.register();
    expect(registration).toEqual({
      deviceId: "android-test",
      name: "Pixel",
      token: "rdt_first_token",
    });

    const restartedClient = createAndroidDeviceClient({
      api,
      storage,
      getDeviceName: () => "Ignored after restart",
      createDeviceId: () => "ignored-after-restart",
    });
    await expect(restartedClient.heartbeat()).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
