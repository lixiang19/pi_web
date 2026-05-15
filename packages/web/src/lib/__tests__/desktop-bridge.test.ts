import { describe, expect, it, vi, beforeEach } from "vitest";
import {
	isTauri,
	syncDesktopStatus,
	tauriCaptureClipboard,
	tauriCaptureBrowserUrl,
	tauriCaptureSelection,
	tauriCaptureScreenshotRegion,
	tauriCaptureScreenshotWindow,
	tauriCaptureScreenshotFullscreen,
	setDesktopBridgeInvokeForTests,
} from "@/lib/desktop-bridge";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("desktop-bridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setDesktopBridgeInvokeForTests((command, args) =>
			args === undefined ? mockInvoke(command) : mockInvoke(command, args),
		);
		delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
	});

	describe("isTauri", () => {
		it("returns false when __TAURI_INTERNALS__ is not on window", () => {
			expect(isTauri()).toBe(false);
		});

		it("returns true when __TAURI_INTERNALS__ is on window", () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			expect(isTauri()).toBe(true);
		});
	});

	describe("syncDesktopStatus", () => {
		it("returns immediately when not in Tauri", async () => {
			await syncDesktopStatus(true, true);
			expect(mockInvoke).not.toHaveBeenCalled();
		});

		it("invokes set_desktop_status when in Tauri", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockResolvedValue(undefined);
			await syncDesktopStatus(true, true);
			expect(mockInvoke).toHaveBeenCalledWith("set_desktop_status", { online: true, authenticated: true });
		});

		it("silently catches invoke errors", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockRejectedValue(new Error("fail"));
			await expect(syncDesktopStatus(true, true)).resolves.toBeUndefined();
		});
	});

	describe("tauriCaptureClipboard", () => {
		it("returns null when not in Tauri", async () => {
			const result = await tauriCaptureClipboard();
			expect(result).toBeNull();
			expect(mockInvoke).not.toHaveBeenCalled();
		});

		it("returns clipboard text when in Tauri", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockResolvedValue("hello");
			const result = await tauriCaptureClipboard();
			expect(result).toBe("hello");
			expect(mockInvoke).toHaveBeenCalledWith("capture_clipboard");
		});

		it("returns null on empty string", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockResolvedValue("");
			const result = await tauriCaptureClipboard();
			expect(result).toBeNull();
		});

		it("returns null on invoke error", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockRejectedValue(new Error("fail"));
			const result = await tauriCaptureClipboard();
			expect(result).toBeNull();
		});
	});

	describe("tauriCaptureBrowserUrl", () => {
		it("returns null when not in Tauri", async () => {
			const result = await tauriCaptureBrowserUrl();
			expect(result).toBeNull();
		});

		it("returns parsed url/title/selectedText from tuple", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockResolvedValue(["https://example.com", "Example", "some text"]);
			const result = await tauriCaptureBrowserUrl();
			expect(result).toEqual({
				url: "https://example.com",
				title: "Example",
				selectedText: "some text",
			});
			expect(mockInvoke).toHaveBeenCalledWith("capture_browser_url");
		});

		it("returns null on invoke error", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockRejectedValue(new Error("fail"));
			const result = await tauriCaptureBrowserUrl();
			expect(result).toBeNull();
		});
	});

	describe("tauriCaptureSelection", () => {
		it("returns null when not in Tauri", async () => {
			const result = await tauriCaptureSelection();
			expect(result).toBeNull();
		});

		it("returns text on success", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockResolvedValue("selected text");
			const result = await tauriCaptureSelection();
			expect(result).toBe("selected text");
			expect(mockInvoke).toHaveBeenCalledWith("capture_selection");
		});

		it("returns null on empty string", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockResolvedValue("");
			const result = await tauriCaptureSelection();
			expect(result).toBeNull();
		});

		it("returns null on invoke error", async () => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockRejectedValue(new Error("fail"));
			const result = await tauriCaptureSelection();
			expect(result).toBeNull();
		});
	});

	describe("screenshot functions", () => {
		it.each([
			["tauriCaptureScreenshotRegion", tauriCaptureScreenshotRegion, "capture_screenshot_region"],
			["tauriCaptureScreenshotWindow", tauriCaptureScreenshotWindow, "capture_screenshot_window"],
			["tauriCaptureScreenshotFullscreen", tauriCaptureScreenshotFullscreen, "capture_screenshot_fullscreen"],
		] as const)("%s invokes correct command", async (_name, fn, command) => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			const fakeData = new Uint8Array([1, 2, 3]);
			mockInvoke.mockResolvedValue(fakeData);
			const result = await fn();
			expect(mockInvoke).toHaveBeenCalledWith(command);
			expect(result).toEqual(fakeData);
		});

		it.each([
			["tauriCaptureScreenshotRegion", tauriCaptureScreenshotRegion],
			["tauriCaptureScreenshotWindow", tauriCaptureScreenshotWindow],
			["tauriCaptureScreenshotFullscreen", tauriCaptureScreenshotFullscreen],
		] as const)("%s returns null when not in Tauri", async (_name, fn) => {
			const result = await fn();
			expect(result).toBeNull();
			expect(mockInvoke).not.toHaveBeenCalled();
		});

		it.each([
			["tauriCaptureScreenshotRegion", tauriCaptureScreenshotRegion],
			["tauriCaptureScreenshotWindow", tauriCaptureScreenshotWindow],
			["tauriCaptureScreenshotFullscreen", tauriCaptureScreenshotFullscreen],
		] as const)("%s returns null on invoke error", async (_name, fn) => {
			(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
			mockInvoke.mockRejectedValue(new Error("fail"));
			const result = await fn();
			expect(result).toBeNull();
		});
	});
});
