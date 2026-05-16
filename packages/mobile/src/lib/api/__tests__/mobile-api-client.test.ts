import { describe, expect, it } from "vitest";
import {
  MOBILE_SERVICE_URL_STORAGE_KEY,
  MobileApiConfigurationError,
  createMobileApiClient,
} from "@/lib/api/mobile-api-client";

describe("mobile API client", () => {
  it("returns a clear configuration error when service address is missing", async () => {
    const client = createMobileApiClient();

    await expect(client.get("/api/devices")).rejects.toMatchObject({
      name: "MobileApiConfigurationError",
      code: "MOBILE_SERVICE_URL_MISSING",
      message: "请先在移动端设置 ridge 服务地址",
    });
  });

  it("normalizes and stores the configured service address", () => {
    const client = createMobileApiClient();

    client.setServiceBaseUrl("https://ridge.example.com/");

    expect(window.localStorage.getItem(MOBILE_SERVICE_URL_STORAGE_KEY)).toBe(
      "https://ridge.example.com",
    );
    expect(client.getServiceBaseUrl()).toBe("https://ridge.example.com");
    expect(() => client.requireServiceBaseUrl()).not.toThrow(
      MobileApiConfigurationError,
    );
  });
});
