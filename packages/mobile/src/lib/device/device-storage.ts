export const MOBILE_DEVICE_REGISTRATION_STORAGE_KEY =
  "ridge.mobile.deviceRegistration";

export interface MobileDeviceRegistration {
  deviceId: string;
  token: string;
  name: string;
}

export interface MobileDeviceStorage {
  getRegistration(): MobileDeviceRegistration | null;
  saveRegistration(registration: MobileDeviceRegistration): void;
  clearRegistration(): void;
}

function isRegistration(value: unknown): value is MobileDeviceRegistration {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["deviceId"] === "string" &&
    typeof candidate["token"] === "string" &&
    typeof candidate["name"] === "string"
  );
}

export function createDeviceStorage(
  storage: Storage = window.localStorage,
): MobileDeviceStorage {
  return {
    getRegistration() {
      const raw = storage.getItem(MOBILE_DEVICE_REGISTRATION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return isRegistration(parsed) ? parsed : null;
    },
    saveRegistration(registration) {
      storage.setItem(
        MOBILE_DEVICE_REGISTRATION_STORAGE_KEY,
        JSON.stringify(registration),
      );
    },
    clearRegistration() {
      storage.removeItem(MOBILE_DEVICE_REGISTRATION_STORAGE_KEY);
    },
  };
}
