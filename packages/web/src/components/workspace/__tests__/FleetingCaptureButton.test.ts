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
	getAuthSession: vi.fn(),
}));

vi.mock("@/lib/desktop-bridge", () => ({
	isTauri: vi.fn(() => false),
	syncDesktopStatus: vi.fn(),
}));

import { captureFromDesktop, getAuthSession } from "@/lib/api";
import { isTauri } from "@/lib/desktop-bridge";

const mockCaptureFromDesktop = vi.mocked(captureFromDesktop);
const mockGetAuthSession = vi.mocked(getAuthSession);
const mockIsTauri = vi.mocked(isTauri);

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
				lastError: null,
				retryCount: 0,
				piSessionId: null,
				piSessionFile: null,
				captureType: "text",
				metadata: {},
				createdAt: 1,
				updatedAt: 1,
			},
			attachments: [],
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

	it("switches to file mode", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		const fileButton = wrapper
			.findAll("button")
			.find((button) => button.attributes("aria-label") === "文件采集")!;
		await fileButton.trigger("click");
		expect(wrapper.find('input[type="file"]').exists()).toBe(true);
	});

	it("switches to audio mode", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		const audioButton = wrapper
			.findAll("button")
			.find((button) => button.attributes("aria-label") === "录音采集")!;
		await audioButton.trigger("click");
		// Audio mode should show start recording button
		expect(wrapper.text()).toContain("开始录音");
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
});