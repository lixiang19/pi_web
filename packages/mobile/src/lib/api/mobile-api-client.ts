export const MOBILE_SERVICE_URL_STORAGE_KEY = "ridge.mobile.serviceBaseUrl";

export type MobileApiErrorCode = "MOBILE_SERVICE_URL_MISSING";

export class MobileApiConfigurationError extends Error {
  readonly code: MobileApiErrorCode;

  constructor(code: MobileApiErrorCode, message: string) {
    super(message);
    this.name = "MobileApiConfigurationError";
    this.code = code;
  }
}

export interface MobileApiClientOptions {
  storage?: Storage;
  fetcher?: typeof fetch;
}

export interface MobileApiClient {
  getServiceBaseUrl(): string | null;
  setServiceBaseUrl(value: string): void;
  requireServiceBaseUrl(): string;
  get(path: string, init?: RequestInit): Promise<Response>;
  post(path: string, body: unknown, init?: RequestInit): Promise<Response>;
}

function normalizeServiceBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function createMobileApiClient(
  options: MobileApiClientOptions = {},
): MobileApiClient {
  const storage = options.storage ?? window.localStorage;
  const fetcher = options.fetcher ?? fetch;

  const getServiceBaseUrl = () => {
    const value = storage.getItem(MOBILE_SERVICE_URL_STORAGE_KEY);
    return value ? normalizeServiceBaseUrl(value) : null;
  };

  const setServiceBaseUrl = (value: string) => {
    storage.setItem(MOBILE_SERVICE_URL_STORAGE_KEY, normalizeServiceBaseUrl(value));
  };

  const requireServiceBaseUrl = () => {
    const baseUrl = getServiceBaseUrl();
    if (!baseUrl) {
      throw new MobileApiConfigurationError(
        "MOBILE_SERVICE_URL_MISSING",
        "请先在移动端设置 ridge 服务地址",
      );
    }
    return baseUrl;
  };

  const get = async (path: string, init: RequestInit = {}) => {
    const baseUrl = requireServiceBaseUrl();
    const apiPath = path.startsWith("/") ? path : `/${path}`;
    return fetcher(`${baseUrl}${apiPath}`, {
      ...init,
      method: "GET",
    });
  };

  const post = async (path: string, body: unknown, init: RequestInit = {}) => {
    const baseUrl = requireServiceBaseUrl();
    const apiPath = path.startsWith("/") ? path : `/${path}`;
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetcher(`${baseUrl}${apiPath}`, {
      ...init,
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  };

  return {
    getServiceBaseUrl,
    setServiceBaseUrl,
    requireServiceBaseUrl,
    get,
    post,
  };
}
