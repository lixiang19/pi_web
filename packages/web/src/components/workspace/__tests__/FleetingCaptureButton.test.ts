import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FleetingCaptureButton from "../FleetingCaptureButton.vue";

vi.mock("vue-sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("@/lib/api", () => ({
	captureFromDesktop: vi.fn(),
	createFleetingNote: vi.fn(),
	getAuthSession: vi.fn(),
}));

vi.mock("@/lib/desktop-bridge", () => ({
	isTauri: vi.fn(() => false),
	tauriCaptureClipboard: vi.fn(),
	tauriCaptureBrowserUrl: vi.fn(),
	tauriCaptureSelection: vi.fn(),
	tauriCaptureScreenshotRegion: vi.fn(),
	tauriCaptureScreenshotWindow: vi.fn(),
	tauriCaptureScreenshotFullscreen: vi.fn(),
	syncDesktopStatus: vi.fn(),
}));

import { captureFromDesktop, createFleetingNote, getAuthSession } from "@/lib/api";
import {
	isTauri,
	tauriCaptureClipboard,
	tauriCaptureBrowserUrl,
	tauriCaptureSelection,
	tauriCaptureScreenshotRegion,
} from "@/lib/desktop-bridge";

const mockCaptureFromDesktop = vi.mocked(captureFromDesktop);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockGetAuthSession = vi.mocked(getAuthSession);
const mockIsTauri = vi.mocked(isTauri);
const mockTauriCaptureClipboard = vi.mocked(tauriCaptureClipboard);
const mockTauriCaptureBrowserUrl = vi.mocked(tauriCaptureBrowserUrl);
const mockTauriCaptureSelection = vi.mocked(tauriCaptureSelection);
const mockTauriCaptureScreenshotRegion = vi.mocked(tauriCaptureScreenshotRegion);

describe("FleetingCaptureButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsTauri.mockReturnValue(false);
		mockGetAuthSession.mockResolvedValue({ authenticated: true });
		mockCaptureFromDesktop.mockResolvedValue({
			note: {
				id: "flash-1",
				content: "闪念",
				status: "pending",
				analysisStatus: "unanalyzed",
				recommendationType: null,
				recommendationText: null,
				draft: null,
				requiresInput: false,
				piSessionId: null,
				piSessionFile: null,
				captureType: "text",
				metadata: {},
				createdAt: 1,
				updatedAt: 1,
			},
			attachments: [],
		});
		mockCreateFleetingNote.mockResolvedValue({
			note: {
				id: "flash-1",
				content: "闪念",
				status: "pending",
				analysisStatus: "unanalyzed",
				recommendationType: null,
				recommendationText: null,
				draft: null,
				requiresInput: false,
				piSessionId: null,
				piSessionFile: null,
				createdAt: 1,
				updatedAt: 1,
			},
		});
	});

	it("opens the capture panel and saves a text capture", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		await wrapper.get("textarea").setValue("一个新的闪念");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");
		expect(mockCaptureFromDesktop).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "一个新的闪念",
				type: "text",
			}),
		);
	});

	it("does not save empty text content", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		expect(saveButton.attributes("disabled")).toBeDefined();
		expect(mockCaptureFromDesktop).not.toHaveBeenCalled();
	});

	it("switches to clipboard mode", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		const clipboardButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("剪贴板"))!;
		await clipboardButton.trigger("click");
		expect(wrapper.find("textarea").exists()).toBe(true);
	});

	it("switches to browser_url mode and pre-fills content", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		const browserButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("浏览器网址"))!;
		await browserButton.trigger("click");
		expect(wrapper.find("textarea").exists()).toBe(true);
	});

	it("rejects desktop capture event when not authenticated", async () => {
		mockGetAuthSession.mockResolvedValue({ authenticated: false });
		mount(FleetingCaptureButton);
		window.dispatchEvent(
			new CustomEvent("ridge:capture-desktop", { detail: { type: "text" } }),
		);
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(mockCaptureFromDesktop).not.toHaveBeenCalled();
	});

	it("rejects save when offline", async () => {
		mockGetAuthSession.mockResolvedValue({ authenticated: true });
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		await wrapper.get("textarea").setValue("一个新的闪念");
		window.dispatchEvent(new Event("offline"));
		await new Promise((resolve) => setTimeout(resolve, 10));
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(mockCaptureFromDesktop).not.toHaveBeenCalled();
	});

	describe("Tauri desktop bridge integration", () => {
		beforeEach(() => {
			mockIsTauri.mockReturnValue(true);
		});

		it("calls tauriCaptureClipboard in clipboard mode when in Tauri", async () => {
			mockTauriCaptureClipboard.mockResolvedValue("copied text");
			const wrapper = mount(FleetingCaptureButton);
			await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
			const clipboardButton = wrapper
				.findAll("button")
				.find((button) => button.text().includes("剪贴板"))!;
			await clipboardButton.trigger("click");
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockTauriCaptureClipboard).toHaveBeenCalled();
			const textarea = wrapper.get("textarea");
			expect((textarea.element as HTMLTextAreaElement).value).toBe("copied text");
		});

		it("shows error when tauriCaptureClipboard fails", async () => {
			mockTauriCaptureClipboard.mockResolvedValue(null);
			const wrapper = mount(FleetingCaptureButton);
			await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
			const clipboardButton = wrapper
				.findAll("button")
				.find((button) => button.text().includes("剪贴板"))!;
			await clipboardButton.trigger("click");
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockTauriCaptureClipboard).toHaveBeenCalled();
			const textarea = wrapper.get("textarea");
			expect((textarea.element as HTMLTextAreaElement).value).toBe("");
		});

		it("calls tauriCaptureBrowserUrl in browser_url mode when in Tauri", async () => {
			mockTauriCaptureBrowserUrl.mockResolvedValue({
				url: "https://example.com",
				title: "Example",
				selectedText: "some selected text",
			});
			const wrapper = mount(FleetingCaptureButton);
			await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
			const browserButton = wrapper
				.findAll("button")
				.find((button) => button.text().includes("浏览器网址"))!;
			await browserButton.trigger("click");
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockTauriCaptureBrowserUrl).toHaveBeenCalled();
			const textarea = wrapper.get("textarea");
			expect((textarea.element as HTMLTextAreaElement).value).toBe("Example\nhttps://example.com");
			// Save and verify metadata includes native title and selectedText
			const saveButton = wrapper
				.findAll("button")
				.find((button) => button.text().includes("保存"))!;
			await saveButton.trigger("click");
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockCaptureFromDesktop).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "browser_url",
					metadata: {
						title: "Example",
						selectedText: "some selected text",
					},
				}),
			);
		});

		it("calls tauriCaptureSelection in selection mode when in Tauri", async () => {
			mockTauriCaptureSelection.mockResolvedValue("selected content");
			const wrapper = mount(FleetingCaptureButton);
			await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
			const selectionButton = wrapper
				.findAll("button")
				.find((button) => button.text().includes("当前选区"))!;
			await selectionButton.trigger("click");
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockTauriCaptureSelection).toHaveBeenCalled();
			const textarea = wrapper.get("textarea");
			expect((textarea.element as HTMLTextAreaElement).value).toBe("selected content");
		});

		it("calls tauriCaptureScreenshotRegion in screenshot mode when in Tauri", async () => {
			const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
			mockTauriCaptureScreenshotRegion.mockResolvedValue(fakePng);
			const wrapper = mount(FleetingCaptureButton);
			await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
			const screenshotButton = wrapper
				.findAll("button")
				.find((button) => button.text().includes("区域截图"))!;
			await screenshotButton.trigger("click");
			await new Promise((resolve) => setTimeout(resolve, 10));
			const saveButton = wrapper
				.findAll("button")
				.find((button) => button.text().includes("保存"))!;
			await saveButton.trigger("click");
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(mockTauriCaptureScreenshotRegion).toHaveBeenCalled();
			expect(mockCaptureFromDesktop).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "screenshot_region",
					attachments: expect.arrayContaining([
						expect.objectContaining({
							name: "screenshot-region.png",
							mimeType: "image/png",
						}),
					]),
				}),
			);
		});
	});
});
