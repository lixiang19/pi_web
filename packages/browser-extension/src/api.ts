import { sanitizeUrlForCapture } from "./lib/url";
import type { PageSnapshot, RidgeExtensionSettings } from "./types";

interface DeviceRegisterResponse {
	deviceId: string;
	name: string;
	token: string;
}

interface BrowserCaptureResponse {
	note: unknown;
}

function apiUrl(settings: RidgeExtensionSettings, pathname: string): string {
	return new URL(pathname, settings.baseUrl).toString();
}

async function readJson<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => ({}))) as unknown;
	if (!response.ok) {
		const message =
			typeof body === "object" &&
			body !== null &&
			typeof (body as Record<string, unknown>).error === "string"
				? String((body as Record<string, unknown>).error)
				: `HTTP ${response.status}`;
		throw new Error(message);
	}
	return body as T;
}

export async function registerBrowserDevice(
	settings: RidgeExtensionSettings,
	deviceName: string,
): Promise<DeviceRegisterResponse> {
	const deviceId = settings.deviceId ?? `browser-${crypto.randomUUID()}`;
	const response = await fetch(apiUrl(settings, "/api/devices/register"), {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			deviceId,
			name: deviceName,
			deviceType: "browser",
			capabilities: { browser_capture: true, silent_reading_capture: true },
		}),
	});
	return readJson<DeviceRegisterResponse>(response);
}

export async function submitBrowserCapture(
	settings: RidgeExtensionSettings,
	snapshot: PageSnapshot,
): Promise<BrowserCaptureResponse> {
	if (!settings.deviceId || !settings.token) {
		throw new Error("Chrome 插件尚未连接 ridge");
	}
	const response = await fetch(apiUrl(settings, "/api/browser/captures"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			deviceId: settings.deviceId,
			token: settings.token,
			url: sanitizeUrlForCapture(snapshot.url),
			title: snapshot.title,
			siteName: snapshot.siteName,
			language: snapshot.language,
			reading: snapshot.reading,
		}),
	});
	return readJson<BrowserCaptureResponse>(response);
}

export async function heartbeat(settings: RidgeExtensionSettings): Promise<void> {
	if (!settings.deviceId || !settings.token) return;
	const response = await fetch(apiUrl(settings, "/api/devices/heartbeat"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ deviceId: settings.deviceId, token: settings.token }),
	});
	await readJson<{ ok: true }>(response);
}
