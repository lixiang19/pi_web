import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import WorkbenchReadonlyFilePreview from "@/components/workbench/file-preview/WorkbenchReadonlyFilePreview.vue";

describe("WorkbenchReadonlyFilePreview audio rendering", () => {
	it("renders an audio element with correct src for audio previewKind", () => {
		const wrapper = mount(WorkbenchReadonlyFilePreview, {
			props: {
				blobUrl: "/api/files/blob?path=/workspace/audio.mp3&root=/workspace",
				content: "",
				error: "",
				extension: ".mp3",
				fileName: "audio.mp3",
				isLargeFile: false,
				isLoadingMore: false,
				mimeType: "audio/mpeg",
				nextStartLine: null,
				previewLineCount: 0,
				previewKind: "audio",
			},
		});

		const audio = wrapper.find("audio");
		expect(audio.exists()).toBe(true);
		expect(audio.attributes("src")).toBe("/api/files/blob?path=/workspace/audio.mp3&root=/workspace");
		expect(wrapper.text()).toContain("audio.mp3");
	});

	it("does not render audio element for unsupported previewKind", () => {
		const wrapper = mount(WorkbenchReadonlyFilePreview, {
			props: {
				blobUrl: "",
				content: "",
				error: "",
				extension: ".bin",
				fileName: "data.bin",
				isLargeFile: false,
				isLoadingMore: false,
				mimeType: "application/octet-stream",
				nextStartLine: null,
				previewLineCount: 0,
				previewKind: "unsupported",
			},
		});

		expect(wrapper.find("audio").exists()).toBe(false);
	});

	it("renders an img element for image previewKind", () => {
		const wrapper = mount(WorkbenchReadonlyFilePreview, {
			props: {
				blobUrl: "/api/files/blob?path=/workspace/pic.png&root=/workspace",
				content: "",
				error: "",
				extension: ".png",
				fileName: "pic.png",
				isLargeFile: false,
				isLoadingMore: false,
				mimeType: "image/png",
				nextStartLine: null,
				previewLineCount: 0,
				previewKind: "image",
			},
		});

		const img = wrapper.find("img");
		expect(img.exists()).toBe(true);
		expect(img.attributes("src")).toBe("/api/files/blob?path=/workspace/pic.png&root=/workspace");
	});
});
