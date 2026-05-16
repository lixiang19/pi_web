import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CapturePage from "@/features/capture/CapturePage.vue";

afterEach(() => {
	window.localStorage.clear();
	vi.restoreAllMocks();
});

describe("CapturePage mobile fleeting capture", () => {
	it("submits a text capture to the mobile capture endpoint", async () => {
		window.localStorage.setItem("ridge.mobile.serviceBaseUrl", "https://ridge.example.com");
		window.localStorage.setItem(
			"ridge.mobile.deviceRegistration",
			JSON.stringify({
				deviceId: "android-page",
				token: "rdt_page",
				name: "Pixel",
			}),
		);
		const fetcher = vi.spyOn(window, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ note: { id: "flash-1" }, attachments: [] }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const wrapper = mount(CapturePage);

		await wrapper.find("[data-testid='capture-textarea']").setValue("地铁上想到的点");
		await wrapper.find("[data-testid='save-capture-button']").trigger("click");
		await flushPromises();

		expect(fetcher).toHaveBeenCalledWith(
			"https://ridge.example.com/api/mobile/captures",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					deviceId: "android-page",
					token: "rdt_page",
					text: "地铁上想到的点",
					attachments: [],
				}),
			}),
		);
		expect(wrapper.text()).toContain("已保存");
		expect((wrapper.find("[data-testid='capture-textarea']").element as HTMLTextAreaElement).value).toBe("");
	});
});
