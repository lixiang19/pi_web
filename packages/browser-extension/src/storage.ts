import type { PendingCapture, RidgeExtensionSettings } from "./types";

const SETTINGS_KEY = "ridge.settings";
const QUEUE_KEY = "ridge.captureQueue";

export const DEFAULT_SETTINGS: RidgeExtensionSettings = {
	baseUrl: "http://127.0.0.1:3000",
	autoCapture: true,
	blockedDomains: [],
};

function readLocal<T>(key: string): Promise<T | undefined> {
	return chrome.storage.local.get(key).then((value) => value[key] as T | undefined);
}

export async function getSettings(): Promise<RidgeExtensionSettings> {
	return {
		...DEFAULT_SETTINGS,
		...((await readLocal<Partial<RidgeExtensionSettings>>(SETTINGS_KEY)) ?? {}),
	};
}

export async function saveSettings(settings: Partial<RidgeExtensionSettings>): Promise<RidgeExtensionSettings> {
	const next = { ...(await getSettings()), ...settings };
	await chrome.storage.local.set({ [SETTINGS_KEY]: next });
	return next;
}

export async function getQueue(): Promise<PendingCapture[]> {
	return (await readLocal<PendingCapture[]>(QUEUE_KEY)) ?? [];
}

export async function saveQueue(queue: PendingCapture[]): Promise<void> {
	await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

export async function enqueueCapture(snapshot: PendingCapture["snapshot"], error: string): Promise<void> {
	const queue = await getQueue();
	queue.push({
		id: crypto.randomUUID(),
		snapshot,
		createdAt: Date.now(),
		lastError: error,
	});
	await saveQueue(queue.slice(-100));
}
