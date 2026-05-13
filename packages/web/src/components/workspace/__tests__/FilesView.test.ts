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

  it("shows retry button for failed files and emits retry on click", async () => {
    const entries: FileTreeEntry[] = [
      makeEntry("failed.pdf", "file", "convert_failed"),
      makeEntry("ok.md", "file", "indexed"),
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
    expect(rows.length).toBe(2);

    // Failed file has retry button
    const retryBtn = rows[0]!.find("button[title='重试处理']");
    expect(retryBtn.exists()).toBe(true);

    // Indexed file has no retry button
    expect(rows[1]!.find("button[title='重试处理']").exists()).toBe(false);

    // Click retry button
    await retryBtn.trigger("click");
    expect(wrapper.emitted("retry")).toBeTruthy();
    expect(wrapper.emitted("retry")![0]![0]).toBe("/ws/failed.pdf");

    // Retry click should NOT also emit open-file
    expect(wrapper.emitted("open-file")).toBeFalsy();
  });

  it("emits open-file when pressing Enter on a file row", async () => {
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
    const row = wrapper.find("[data-test='file-row']");
    await row.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("open-file")).toBeTruthy();
    expect(wrapper.emitted("open-file")![0]![0]).toBe("/ws/notes.md");
  });

  it("emits open-file when pressing Space on a file row", async () => {
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
    const row = wrapper.find("[data-test='file-row']");
    await row.trigger("keydown", { key: " " });

    expect(wrapper.emitted("open-file")).toBeTruthy();
    expect(wrapper.emitted("open-file")![0]![0]).toBe("/ws/notes.md");
  });

  it("emits navigate when pressing Enter on a directory row", async () => {
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
    const row = wrapper.find("[data-test='file-row']");
    await row.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("navigate")).toBeTruthy();
    expect(wrapper.emitted("navigate")![0]![0]).toBe("/ws/附件");
  });

  it("file row has role=button and tabindex=0 for accessibility", async () => {
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
    const row = wrapper.find("[data-test='file-row']");
    expect(row.attributes("role")).toBe("button");
    expect(row.attributes("tabindex")).toBe("0");
  });
});
