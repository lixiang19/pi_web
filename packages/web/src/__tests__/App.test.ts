import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "@/App.vue";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

vi.mock("@/components/ui/sonner", () => ({
	Sonner: defineComponent({ template: '<div data-test="sonner" />' }),
}));

const TooltipRoute = defineComponent({
	components: { Tooltip, TooltipContent, TooltipTrigger },
	template: `
    <Tooltip>
      <TooltipTrigger as-child>
        <button type="button">说明</button>
      </TooltipTrigger>
      <TooltipContent>说明内容</TooltipContent>
    </Tooltip>
  `,
});

describe("App", () => {
	it("为所有路由提供全局 Tooltip 上下文", async () => {
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: "/", component: TooltipRoute }],
		});

		router.push("/");
		await router.isReady();

		expect(() => {
			mount(App, {
				global: {
					plugins: [router],
				},
			});
		}).not.toThrow();
	});
});
