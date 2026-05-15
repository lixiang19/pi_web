import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SpacePreviewTab from "@/components/workspace/SpacePreviewTab.vue";

describe("SpacePreviewTab", () => {
	it("renders private HTML through srcdoc with script-only sandbox", () => {
		const wrapper = mount(SpacePreviewTab, {
			props: {
				title: "demo",
				html: "<html><head></head><body><button>run</button><script>window.count = 1</script></body></html>",
			},
		});

		const iframe = wrapper.get("iframe");
		expect(iframe.attributes("sandbox")).toBe("allow-scripts");
		expect(iframe.attributes("sandbox")).not.toContain("allow-same-origin");
		expect(iframe.attributes("referrerpolicy")).toBe("no-referrer");
		expect(iframe.attributes("srcdoc")).toContain("connect-src 'none'");
		expect(iframe.attributes("srcdoc")).toContain("script-src 'unsafe-inline'");
		expect(iframe.attributes("srcdoc")).toContain("<script>window.count = 1</script>");
	});

	it("places CSP before author active content even when source has pre-head content", () => {
		const wrapper = mount(SpacePreviewTab, {
			props: {
				title: "demo",
				html: "<script>fetch('/api/auth/session')</script><html><head></head><body>demo</body></html>",
			},
		});

		const srcdoc = wrapper.get("iframe").attributes("srcdoc") ?? "";
		expect(srcdoc.indexOf("Content-Security-Policy")).toBeGreaterThanOrEqual(0);
		expect(srcdoc.indexOf("Content-Security-Policy")).toBeLessThan(
			srcdoc.indexOf("<script>fetch('/api/auth/session')</script>"),
		);
		expect(srcdoc).toContain("connect-src 'none'");
	});
});
