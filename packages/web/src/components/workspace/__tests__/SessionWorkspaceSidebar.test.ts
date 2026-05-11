import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SessionWorkspaceSidebar from "@/components/workspace/SessionWorkspaceSidebar.vue";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: { name: "ScrollArea", template: "<div><slot /></div>" },
}));

vi.mock("@/components/common/FileTreePanel.vue", () => ({
  default: { name: "FileTreePanel", template: `<div data-test="file-tree-panel" />` },
}));

const createWrapper = (props: {
  sessionId: string;
  sessionTitle: string;
  fileTreeRoot: string;
  projectType?: "internal" | "external";
  isGit?: boolean;
  isOnline?: boolean;
  messageCount?: number;
  roundCount?: number;
}) => mount(SessionWorkspaceSidebar, { props });

describe("SessionWorkspaceSidebar summary counts", () => {
  it("shows provided message and round counts", () => {
    const wrapper = createWrapper({
      sessionId: "s1",
      sessionTitle: "Test",
      fileTreeRoot: "/ws",
      messageCount: 12,
      roundCount: 5,
    });
    expect(wrapper.text()).toContain("12 / 5");
  });

  it("defaults to 0 when counts are not provided", () => {
    const wrapper = createWrapper({
      sessionId: "s1",
      sessionTitle: "Test",
      fileTreeRoot: "/ws",
    });
    expect(wrapper.text()).toContain("0 / 0");
  });
});

describe("SessionWorkspaceSidebar basic rendering", () => {
  it("renders summary tab by default", () => {
    const wrapper = createWrapper({
      sessionId: "s1",
      sessionTitle: "Test",
      fileTreeRoot: "/ws",
      projectType: "internal",
      isGit: false,
      isOnline: true,
    });
    expect(wrapper.text()).toContain("摘要");
    expect(wrapper.text()).toContain("运行位置");
    expect(wrapper.text()).toContain("内部项目");
  });

  it("switches to file tree tab", async () => {
    const wrapper = createWrapper({
      sessionId: "s1",
      sessionTitle: "Test",
      fileTreeRoot: "/ws",
      projectType: "internal",
      isGit: false,
      isOnline: true,
    });
    const tabs = wrapper.findAll("[data-test='sidebar-tab']");
    await tabs[1]?.trigger("click");
    await nextTick();
    expect(wrapper.find('[data-test="file-tree-panel"]').exists()).toBe(true);
  });
});

describe("SessionWorkspaceSidebar diff tab rules", () => {
  it("shows hidden diff placeholder for internal project", async () => {
    const wrapper = createWrapper({
      sessionId: "s1",
      sessionTitle: "Test",
      fileTreeRoot: "/ws",
      projectType: "internal",
      isGit: false,
    });
    const tabs = wrapper.findAll("[data-test='sidebar-tab']");
    await tabs[3]?.trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("隐藏版本管理");
  });

  it("shows git diff placeholder for external git project", async () => {
    const wrapper = createWrapper({
      sessionId: "s1",
      sessionTitle: "Test",
      fileTreeRoot: "/ext",
      projectType: "external",
      isGit: true,
    });
    const tabs = wrapper.findAll("[data-test='sidebar-tab']");
    await tabs[3]?.trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("工作区变更");
  });

  it("shows unavailable diff for external non-git project", async () => {
    const wrapper = createWrapper({
      sessionId: "s1",
      sessionTitle: "Test",
      fileTreeRoot: "/ext",
      projectType: "external",
      isGit: false,
    });
    const tabs = wrapper.findAll("[data-test='sidebar-tab']");
    await tabs[3]?.trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("Diff 不可用");
  });
});
