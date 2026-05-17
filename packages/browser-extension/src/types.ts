import type { ReadingSignal } from "./lib/reading-signal";

export interface RidgeExtensionSettings {
	baseUrl: string;
	autoCapture: boolean;
	blockedDomains: string[];
	deviceId?: string;
	deviceName?: string;
	token?: string;
}

export interface PageSnapshot {
	url: string;
	title: string;
	siteName: string;
	language: string;
	reading: ReadingSignal & { capturedAt: number };
}

export interface PendingCapture {
	id: string;
	snapshot: PageSnapshot;
	createdAt: number;
	lastError?: string;
}

export type ContentMessage =
	| { type: "RIDGE_READING_READY"; reading: PageSnapshot["reading"] }
	| { type: "RIDGE_COLLECT_PAGE" };

export type PopupMessage =
	| { type: "RIDGE_REGISTER"; baseUrl: string; deviceName: string }
	| { type: "RIDGE_CAPTURE_ACTIVE_TAB" }
	| { type: "RIDGE_GET_STATUS" }
	| { type: "RIDGE_SAVE_SETTINGS"; settings: Partial<RidgeExtensionSettings> }
	| { type: "RIDGE_RETRY_QUEUE" };
