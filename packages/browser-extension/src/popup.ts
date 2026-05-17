import type { PopupMessage, RidgeExtensionSettings } from "./types";

const form = document.querySelector<HTMLFormElement>("#settings-form");
const baseUrl = document.querySelector<HTMLInputElement>("#base-url");
const deviceName = document.querySelector<HTMLInputElement>("#device-name");
const autoCapture = document.querySelector<HTMLInputElement>("#auto-capture");
const blockedDomains = document.querySelector<HTMLTextAreaElement>("#blocked-domains");
const statusText = document.querySelector<HTMLElement>("#status");
const queueText = document.querySelector<HTMLElement>("#queue");
const captureButton = document.querySelector<HTMLButtonElement>("#capture");
const retryButton = document.querySelector<HTMLButtonElement>("#retry");

function setStatus(message: string) {
	if (statusText) statusText.textContent = message;
}

function send<T>(message: PopupMessage): Promise<T> {
	return chrome.runtime.sendMessage(message) as Promise<T>;
}

function hydrate(settings: RidgeExtensionSettings, queueLength: number) {
	if (baseUrl) baseUrl.value = settings.baseUrl;
	if (deviceName) deviceName.value = settings.deviceName ?? "Chrome";
	if (autoCapture) autoCapture.checked = settings.autoCapture;
	if (blockedDomains) blockedDomains.value = settings.blockedDomains.join("\n");
	if (queueText) queueText.textContent = `${queueLength}`;
	setStatus(settings.token ? "已连接 ridge" : "未连接");
}

async function loadStatus() {
	const response = await send<{
		ok: boolean;
		settings: RidgeExtensionSettings;
		queue: unknown[];
	}>({ type: "RIDGE_GET_STATUS" });
	if (response.ok) hydrate(response.settings, response.queue.length);
}

form?.addEventListener("submit", (event) => {
	event.preventDefault();
	void (async () => {
		setStatus("连接中...");
		await send({
			type: "RIDGE_REGISTER",
			baseUrl: baseUrl?.value.trim() || "http://127.0.0.1:3000",
			deviceName: deviceName?.value.trim() || "Chrome",
		});
		await send({
			type: "RIDGE_SAVE_SETTINGS",
			settings: {
				autoCapture: autoCapture?.checked ?? true,
				blockedDomains: blockedDomains?.value
					.split("\n")
					.map((item) => item.trim().toLowerCase())
					.filter(Boolean) ?? [],
			},
		});
		await loadStatus();
	})().catch((error: unknown) => setStatus(error instanceof Error ? error.message : "连接失败"));
});

captureButton?.addEventListener("click", () => {
	void send<{ ok: boolean; error?: string }>({ type: "RIDGE_CAPTURE_ACTIVE_TAB" })
		.then((response) => {
			setStatus(response.ok ? "已保存到闪念" : response.error ?? "保存失败");
			return loadStatus();
		})
		.catch((error: unknown) => setStatus(error instanceof Error ? error.message : "保存失败"));
});

retryButton?.addEventListener("click", () => {
	void send<{ ok: boolean; remaining?: number }>({ type: "RIDGE_RETRY_QUEUE" })
		.then((response) => {
			setStatus(response.ok ? "已重试离线队列" : "重试失败");
			if (queueText && typeof response.remaining === "number") queueText.textContent = `${response.remaining}`;
		})
		.catch((error: unknown) => setStatus(error instanceof Error ? error.message : "重试失败"));
});

void loadStatus();
