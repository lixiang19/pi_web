import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ErrorBoundary from "../ErrorBoundary.vue";

const BrokenChild = defineComponent({
	name: "BrokenChild",
	render() {
		throw new Error("boom");
		return h("div", "unreachable");
	},
});

describe("ErrorBoundary", () => {
	it("renders a scoped fallback when a child component crashes", async () => {
		const wrapper = mount(ErrorBoundary, {
			props: { scope: "设置" },
			slots: {
				default: () => h(BrokenChild),
			},
		});

		await nextTick();
		expect(wrapper.text()).toContain("设置暂时不可用");
		expect(wrapper.text()).toContain("boom");
	});
});
