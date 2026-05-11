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
	createFleetingNote: vi.fn(),
}));

import { createFleetingNote } from "@/lib/api";

const mockCreateFleetingNote = vi.mocked(createFleetingNote);

describe("FleetingCaptureButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCreateFleetingNote.mockResolvedValue({
			note: {
				id: "flash-1",
				type: "text",
				content: "闪念",
				status: "pending",
				analysisStatus: "unanalyzed",
				suggestion: null,
				recommendationType: null,
				recommendationText: null,
				draft: null,
				requiresInput: false,
				piSessionId: null,
				piSessionFile: null,
				attachments: [],
				createdAt: 1,
				updatedAt: 1,
			},
		});
	});

	it("opens the capture panel and saves a fleeting note", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		await wrapper.get("textarea").setValue("一个新的闪念");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");
		expect(mockCreateFleetingNote).toHaveBeenCalledWith("一个新的闪念");
	});

	it("does not save empty content", async () => {
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		expect(saveButton.attributes("disabled")).toBeDefined();
		expect(mockCreateFleetingNote).not.toHaveBeenCalled();
	});

	it("broadcasts ridge:fleeting-created event on save", async () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		const wrapper = mount(FleetingCaptureButton);
		await wrapper.get("button[aria-label='打开闪念捕捉']").trigger("click");
		await wrapper.get("textarea").setValue("事件测试");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");
		await vi.waitFor(() => expect(mockCreateFleetingNote).toHaveBeenCalled());
		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({ type: "ridge:fleeting-created" }),
		);
		dispatchSpy.mockRestore();
	});
});
