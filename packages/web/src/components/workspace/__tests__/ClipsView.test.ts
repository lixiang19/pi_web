import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClipsView from "../ClipsView.vue";

vi.mock("@/lib/api", () => ({
	getClips: vi.fn(),
}));

import { getClips } from "@/lib/api";

const mockGetClips = vi.mocked(getClips);

describe("ClipsView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetClips.mockResolvedValue({
			clips: [
				{
					id: "clip-1",
					title: "SQLite WAL 资料",
					url: "https://example.com/sqlite",
					content: "一段关于 WAL 的摘录",
					source: "闪念",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			],
		});
	});

	it("loads and renders clips", async () => {
		const wrapper = mount(ClipsView);
		await vi.waitFor(() => expect(wrapper.text()).toContain("SQLite WAL 资料"));
		expect(wrapper.text()).toContain("SQLite WAL 资料");
		expect(wrapper.text()).toContain("https://example.com/sqlite");
		expect(wrapper.text()).toContain("一段关于 WAL 的摘录");
	});

	it("filters clips locally", async () => {
		const wrapper = mount(ClipsView);
		await vi.waitFor(() => expect(wrapper.text()).toContain("SQLite WAL 资料"));
		await wrapper.get("input").setValue("不存在");
		expect(wrapper.text()).toContain("没有匹配的剪藏");
	});
});
