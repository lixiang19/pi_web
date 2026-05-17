import { heartbeat, registerBrowserDevice, submitBrowserCapture } from "./api";
import { hostnameForBlocklist } from "./lib/url";
import {
	enqueueCapture,
	getQueue,
	getSettings,
	saveQueue,
	saveSettings,
} from "./storage";
import type { ContentMessage, PageSnapshot, PopupMessage } from "./types";

const RETRY_ALARM = "ridge.retryCaptureQueue";
const HEARTBEAT_ALARM = "ridge.heartbeat";

function isBlocked(url: string, blockedDomains: string[]) {
	const hostname = hostnameForBlocklist(url);
	return blockedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

async function collectFromTab(tabId: number): Promise<PageSnapshot> {
	const response = await chrome.tabs.sendMessage(tabId, { type: "RIDGE_COLLECT_PAGE" } satisfies ContentMessage);
	return response as PageSnapshot;
}

async function submitOrQueue(snapshot: PageSnapshot) {
	const settings = await getSettings();
	try {
		await submitBrowserCapture(settings, snapshot);
	} catch (error) {
		await enqueueCapture(snapshot, error instanceof Error ? error.message : "保存失败");
		throw error;
	}
}

async function captureTab(tabId: number) {
	const settings = await getSettings();
	const snapshot = await collectFromTab(tabId);
	if (isBlocked(snapshot.url, settings.blockedDomains)) {
		return { ok: false, error: "该域名已排除" };
	}
	await submitOrQueue(snapshot);
	return { ok: true };
}

async function retryQueue() {
	const settings = await getSettings();
	const queue = await getQueue();
	const remaining = [];
	for (const item of queue) {
		try {
			await submitBrowserCapture(settings, item.snapshot);
		} catch (error) {
			remaining.push({
				...item,
				lastError: error instanceof Error ? error.message : "保存失败",
			});
		}
	}
	await saveQueue(remaining);
	return remaining.length;
}

chrome.runtime.onInstalled.addListener(() => {
	void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 10 });
	void chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === RETRY_ALARM) void retryQueue();
	if (alarm.name === HEARTBEAT_ALARM) void getSettings().then(heartbeat).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: ContentMessage | PopupMessage, sender, sendResponse) => {
	void (async () => {
		if (message.type === "RIDGE_READING_READY") {
			const tabId = sender.tab?.id;
			if (!tabId) return { ok: false };
			const settings = await getSettings();
			if (!settings.autoCapture || !settings.token) return { ok: false };
			return captureTab(tabId);
		}

		if (message.type === "RIDGE_REGISTER") {
			const settings = await saveSettings({ baseUrl: message.baseUrl });
			const registered = await registerBrowserDevice(settings, message.deviceName);
			await saveSettings({
				deviceId: registered.deviceId,
				deviceName: registered.name,
				token: registered.token,
			});
			return { ok: true };
		}

		if (message.type === "RIDGE_CAPTURE_ACTIVE_TAB") {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) return { ok: false, error: "没有可捕捉的标签页" };
			return captureTab(tab.id);
		}

		if (message.type === "RIDGE_SAVE_SETTINGS") {
			await saveSettings(message.settings);
			return { ok: true };
		}

		if (message.type === "RIDGE_RETRY_QUEUE") {
			return { ok: true, remaining: await retryQueue() };
		}

		if (message.type === "RIDGE_GET_STATUS") {
			return { ok: true, settings: await getSettings(), queue: await getQueue() };
		}

		return { ok: false };
	})()
		.then(sendResponse)
		.catch((error: unknown) => {
			sendResponse({ ok: false, error: error instanceof Error ? error.message : "操作失败" });
		});
	return true;
});
