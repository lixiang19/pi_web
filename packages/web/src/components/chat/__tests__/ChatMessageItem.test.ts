import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChatMessageItem from "@/components/chat/ChatMessageItem.vue";
import type { UiConversationMessage } from "@/lib/types";

const makeUserMessage = (text: string): UiConversationMessage => ({
  message: {
    role: "user",
    content: text,
    timestamp: Date.now(),
  },
  localId: "u1",
});

const makeAssistantMessage = (text: string): UiConversationMessage => ({
  message: {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  } as unknown as UiConversationMessage["message"],
  localId: "a1",
});

function mountWithTooltip(props: Record<string, unknown>) {
  return mount(ChatMessageItem, {
    props: props as Record<string, unknown> & { message: UiConversationMessage },
    global: { stubs: { TooltipProvider: { template: '<div><slot /></div>' } } },
  });
}

describe("ChatMessageItem - 编辑与重试入口", () => {
  it("user message 显示编辑按钮", () => {
    const wrapper = mountWithTooltip({ message: makeUserMessage("hello") });
    expect(wrapper.text()).toContain("编辑");
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("assistant 最终消息显示复制和重试按钮", () => {
    const wrapper = mountWithTooltip({ message: makeAssistantMessage("hi"), isFinalAssistantMessage: true });
    expect(wrapper.text()).toContain("复制");
    expect(wrapper.text()).toContain("重试");
  });

  it("编辑点击触发 edit 事件", async () => {
    const message = makeUserMessage("edit me");
    const wrapper = mountWithTooltip({ message });
    const buttons = wrapper.findAll("button");
    const editBtn = buttons.find((b) => b.text().includes("编辑"));
    expect(editBtn).toBeDefined();
    await editBtn!.trigger("click");
    expect(wrapper.emitted("edit")?.[0]).toEqual([message]);
  });

  it("重试点击触发 retry 事件", async () => {
    const message = makeAssistantMessage("retry me");
    const wrapper = mountWithTooltip({ message, isFinalAssistantMessage: true });
    const buttons = wrapper.findAll("button");
    const retryBtn = buttons.find((b) => b.text().includes("重试"));
    expect(retryBtn).toBeDefined();
    await retryBtn!.trigger("click");
    expect(wrapper.emitted("retry")?.[0]).toEqual([message]);
  });

  it("任务会话禁用编辑/重试并显示 tooltip", () => {
    const wrapper = mount(ChatMessageItem, {
      props: {
        message: makeUserMessage("task msg"),
        isForkDisabled: true,
        forkDisabledReason: "任务处理会话不支持编辑/重试",
      },
      global: {
        stubs: {
          Tooltip: { template: '<div><slot name="trigger" /><slot /></div>' },
          TooltipTrigger: { template: '<span><slot /></span>' },
          TooltipContent: { template: '<div><slot /></div>' },
        },
      },
    });
    const disabledBtn = wrapper.find("button[disabled]");
    expect(disabledBtn.exists()).toBe(true);
    expect(disabledBtn.text()).toContain("编辑");
  });
});
