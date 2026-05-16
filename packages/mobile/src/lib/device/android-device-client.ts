import type { MobileApiClient } from "@/lib/api/mobile-api-client";
import type {
  MobileDeviceRegistration,
  MobileDeviceStorage,
} from "@/lib/device/device-storage";

const ANDROID_CAPABILITIES = {
  mobile_capture: true,
  camera: true,
  microphone: true,
} as const;

interface AndroidDeviceClientOptions {
  api: MobileApiClient;
  storage: MobileDeviceStorage;
  getDeviceName?: () => string;
  createDeviceId?: () => string;
}

interface DeviceRegisterResponse {
  deviceId: string;
  name: string;
  token: string;
}

export interface AndroidDeviceClient {
  getRegistration(): MobileDeviceRegistration | null;
  register(): Promise<MobileDeviceRegistration>;
  heartbeat(): Promise<{ ok: true }>;
  clearRegistration(): void;
}

function defaultDeviceName() {
  return "Android Device";
}

function defaultDeviceId() {
  return `android-${crypto.randomUUID()}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>)["error"] === "string"
        ? String((body as Record<string, unknown>)["error"])
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function createAndroidDeviceClient(
  options: AndroidDeviceClientOptions,
): AndroidDeviceClient {
  const getDeviceName = options.getDeviceName ?? defaultDeviceName;
  const createDeviceId = options.createDeviceId ?? defaultDeviceId;

  return {
    getRegistration() {
      return options.storage.getRegistration();
    },

    async register() {
      const existing = options.storage.getRegistration();
      const deviceId = existing?.deviceId ?? createDeviceId();
      const name = getDeviceName();
      const response = await options.api.post("/api/devices/register", {
        deviceId,
        name,
        deviceType: "android",
        capabilities: ANDROID_CAPABILITIES,
      });
      const registered = await readJson<DeviceRegisterResponse>(response);
      const registration: MobileDeviceRegistration = {
        deviceId: registered.deviceId,
        token: registered.token,
        name: registered.name,
      };
      options.storage.saveRegistration(registration);
      return registration;
    },

    async heartbeat() {
      const registration = options.storage.getRegistration();
      if (!registration) {
        const registered = await this.register();
        const response = await options.api.post("/api/devices/heartbeat", {
          deviceId: registered.deviceId,
          token: registered.token,
        });
        return readJson<{ ok: true }>(response);
      }

      const response = await options.api.post("/api/devices/heartbeat", {
        deviceId: registration.deviceId,
        token: registration.token,
      });
      return readJson<{ ok: true }>(response);
    },

    clearRegistration() {
      options.storage.clearRegistration();
    },
  };
}
