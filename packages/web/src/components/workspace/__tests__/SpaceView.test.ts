import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SpaceView from "@/components/workspace/SpaceView.vue";
import type { SpaceWorkItem } from "@/lib/types";

const demoWork: SpaceWorkItem = {
	id: "demo-id",
	name: "demo",
	path: "/ws/空间/demo",
	indexPath: "/ws/空间/demo/index.html",
	size: 128,
	modifiedAt: 1714521600000,
};

describe("SpaceView", () => {
	it("emits open-preview when a work item is clicked", async () => {
		const wrapper = mount(SpaceView, {
			props: {
				works: [demoWork],
				loading: false,
				error: "",
			},
		});

		await wrapper.get("[data-test='space-work-row']").trigger("click");

		expect(wrapper.emitted("open-preview")?.[0]).toEqual([demoWork]);
	});

	it("renders an empty state without pretending there is a public URL", () => {
		const wrapper = mount(SpaceView, {
			props: {
				works: [],
				loading: false,
				error: "",
			},
		});

		expect(wrapper.text()).toContain("还没有空间作品");
		expect(wrapper.text()).not.toContain("公开链接");
	});
});
