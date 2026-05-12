import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import FilesView from "@/components/workspace/FilesView.vue";
import type { FileTreeEntry } from "@/lib/types";

const makeEntry = (
	name: string,
	kind: "file" | "directory",
	processingStatus?: FileTreeEntry["processingStatus"],
): FileTreeEntry => ({
	name,
	path: `/ws/${name}`,
	kind,
	relativePath: name,
	size: kind === "file" ? 100 : null,
	modifiedAt: Date.now(),
	extension: kind === "file" ? name.slice(name.lastIndexOf(".")) : "",
	processingStatus,
});

describe("FilesView", () => {
	it("renders directories and files with status badges", async () => {
		const entries: FileTreeEntry[] = [
			makeEntry("附件", "directory"),
			makeEntry("paper.pdf", "file", "converted"),
			makeEntry("notes.md", "file"),
		];

		const wrapper = mount(FilesView, {
			props: {
				workspaceRoot: "/ws",
				entries,
				currentPath: "/ws",
				loading: false,
			},
			global: {
				stubs: {
					Badge: {
						props: ["variant"],
						template: `<span class="badge-stub"><slot /></span>`,
					},
					ScrollArea: {
						template: `<div class="scroll-area-stub"><slot /></div>`,
					},
				},
			},
		});

		await nextTick();

		const rows = wrapper.findAll("[data-test='file-row']");
		expect(rows.length).toBe(3);

		// Directory row
		expect(rows[0]!.text()).toContain("附件");
		expect(rows[0]!.find(".badge-stub").exists()).toBe(false);

		// File with status
		expect(rows[1]!.text()).toContain("paper.pdf");
		expect(rows[1]!.text()).toContain("已转换");

		// File without status
		expect(rows[2]!.text()).toContain("notes.md");
		expect(rows[2]!.find(".badge-stub").exists()).toBe(false);
	});

	it("emits open-file when clicking a file", async () => {
		const entries: FileTreeEntry[] = [makeEntry("notes.md", "file")];

		const wrapper = mount(FilesView, {
			props: {
				workspaceRoot: "/ws",
				entries,
				currentPath: "/ws",
				loading: false,
			},
			global: {
				stubs: {
					Badge: {
						props: ["variant"],
						template: `<span class="badge-stub"><slot /></span>`,
					},
					ScrollArea: {
						template: `<div class="scroll-area-stub"><slot /></div>`,
					},
				},
			},
		});

		await nextTick();
		await wrapper.find("[data-test='file-row']").trigger("click");

		expect(wrapper.emitted("open-file")).toBeTruthy();
		expect(wrapper.emitted("open-file")![0]![0]).toBe("/ws/notes.md");
	});

	it("emits navigate when clicking a directory", async () => {
		const entries: FileTreeEntry[] = [makeEntry("附件", "directory")];

		const wrapper = mount(FilesView, {
			props: {
				workspaceRoot: "/ws",
				entries,
				currentPath: "/ws",
				loading: false,
			},
			global: {
				stubs: {
					Badge: {
						props: ["variant"],
						template: `<span class="badge-stub"><slot /></span>`,
					},
					ScrollArea: {
						template: `<div class="scroll-area-stub"><slot /></div>`,
					},
				},
			},
		});

		await nextTick();
		await wrapper.find("[data-test='file-row']").trigger("click");

		expect(wrapper.emitted("navigate")).toBeTruthy();
		expect(wrapper.emitted("navigate")![0]![0]).toBe("/ws/附件");
	});

	it("shows loading state", () => {
		const wrapper = mount(FilesView, {
			props: {
				workspaceRoot: "/ws",
				entries: [],
				currentPath: "/ws",
				loading: true,
			},
			global: {
				stubs: {
					ScrollArea: {
						template: `<div class="scroll-area-stub"><slot /></div>`,
					},
				},
			},
		});

		expect(wrapper.text()).toContain("加载中");
	});

	it("hides .ridge from breadcrumb and entries", async () => {
		const entries: FileTreeEntry[] = [makeEntry("readme.md", "file")];

		const wrapper = mount(FilesView, {
			props: {
				workspaceRoot: "/ws",
				entries,
				currentPath: "/ws/.ridge/tmp",
				loading: false,
			},
			global: {
				stubs: {
					Badge: {
						props: ["variant"],
						template: `<span class="badge-stub"><slot /></span>`,
					},
					ScrollArea: {
						template: `<div class="scroll-area-stub"><slot /></div>`,
					},
				},
			},
		});

		await nextTick();
		const breadcrumb = wrapper.find("[data-test='breadcrumb']");
		expect(breadcrumb.text()).not.toContain(".ridge");
	});

	it("shows status badges in attachment subdirectory", async () => {
		const entries: FileTreeEntry[] = [
			makeEntry("paper.pdf", "file", "converted"),
			makeEntry("draft.md", "file", "pending"),
		];

		const wrapper = mount(FilesView, {
			props: {
				workspaceRoot: "/ws",
				entries,
				currentPath: "/ws/附件",
				loading: false,
			},
			global: {
				stubs: {
					Badge: {
						props: ["variant"],
						template: `<span class="badge-stub"><slot /></span>`,
					},
					ScrollArea: {
						template: `<div class="scroll-area-stub"><slot /></div>`,
					},
				},
			},
		});

		await nextTick();

		const rows = wrapper.findAll("[data-test='file-row']");
		expect(rows.length).toBe(2);

		expect(rows[0]!.text()).toContain("paper.pdf");
		expect(rows[0]!.text()).toContain("已转换");

		expect(rows[1]!.text()).toContain("draft.md");
		expect(rows[1]!.text()).toContain("待处理");
	});
});
