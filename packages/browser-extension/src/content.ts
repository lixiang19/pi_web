import { shouldCaptureReading } from "./lib/reading-signal";
import type { ContentMessage, PageSnapshot } from "./types";

let activeSince = document.visibilityState === "visible" ? Date.now() : 0;
let dwellMs = 0;
let maxScrollRatio = 0;
let visitCount = 1;
let notified = false;

function updateDwell() {
	if (document.visibilityState !== "visible" || activeSince === 0) return;
	const now = Date.now();
	dwellMs += now - activeSince;
	activeSince = now;
}

function updateScrollRatio() {
	const scrollTop = window.scrollY || document.documentElement.scrollTop;
	const viewportHeight = window.innerHeight;
	const scrollHeight = Math.max(
		document.documentElement.scrollHeight,
		document.body?.scrollHeight ?? 0,
		viewportHeight,
	);
	maxScrollRatio = Math.max(maxScrollRatio, Math.min(1, (scrollTop + viewportHeight) / scrollHeight));
}

function metaContent(selector: string) {
	return document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "";
}

function collectSnapshot(): PageSnapshot {
	updateDwell();
	updateScrollRatio();
	return {
		url: location.href,
		title: document.title || location.hostname,
		siteName: metaContent('meta[property="og:site_name"]'),
		language: document.documentElement.lang || "",
		reading: {
			dwellMs,
			maxScrollRatio,
			visitCount,
			capturedAt: Date.now(),
		},
	};
}

async function loadVisitCount() {
	const key = `ridge.visit.${location.origin}${location.pathname}`;
	const existing = await chrome.storage.session.get(key);
	visitCount = Number(existing[key] ?? 0) + 1;
	await chrome.storage.session.set({ [key]: visitCount });
}

function maybeNotifyReadingReady() {
	updateDwell();
	updateScrollRatio();
	if (notified || !shouldCaptureReading({ dwellMs, maxScrollRatio, visitCount })) {
		return;
	}
	notified = true;
	void chrome.runtime.sendMessage({
		type: "RIDGE_READING_READY",
		reading: collectSnapshot().reading,
	} satisfies ContentMessage);
}

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		activeSince = Date.now();
		return;
	}
	updateDwell();
	activeSince = 0;
	maybeNotifyReadingReady();
});
window.addEventListener("scroll", maybeNotifyReadingReady, { passive: true });
window.addEventListener("pagehide", () => updateDwell());
setInterval(maybeNotifyReadingReady, 5_000);

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
	if (message.type !== "RIDGE_COLLECT_PAGE") return false;
	sendResponse(collectSnapshot());
	return true;
});

void loadVisitCount().then(maybeNotifyReadingReady);
