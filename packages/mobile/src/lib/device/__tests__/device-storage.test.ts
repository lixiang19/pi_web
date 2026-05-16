import { describe, expect, it } from "vitest";
import { createDeviceStorage } from "@/lib/device/device-storage";

describe("mobile device storage", () => {
  it("stores and clears Android device registration state", () => {
    const storage = createDeviceStorage();

    storage.saveRegistration({
      deviceId: "android-1",
      token: "plain-once-token",
      name: "Pixel",
    });

    expect(storage.getRegistration()).toEqual({
      deviceId: "android-1",
      token: "plain-once-token",
      name: "Pixel",
    });

    storage.clearRegistration();

    expect(storage.getRegistration()).toBeNull();
  });
});
