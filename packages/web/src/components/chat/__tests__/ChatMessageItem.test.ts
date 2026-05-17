import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
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

describe("ChatMessageItem", () => {
  it("renders user message without edit button", () => {
    const wrapper = mountWithTooltip({ message: makeUserMessage("hello") });
    expect(wrapper.text()).not.toContain("编辑");
  });

  it("assistant 最终消息只显示复制按钮", () => {
    const wrapper = mountWithTooltip({ message: makeAssistantMessage("hi"), isFinalAssistantMessage: true });
    expect(wrapper.text()).toContain("复制");
    expect(wrapper.text()).not.toContain("重试");
  });

  it("复制点击后变为已复制", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true, configurable: true });
    const wrapper = mountWithTooltip({ message: makeAssistantMessage("copy me"), isFinalAssistantMessage: true });
    const btn = wrapper.findAll("button").find((b) => b.text().includes("复制"));
    expect(btn).toBeDefined();
    await btn!.trigger("click");
    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(wrapper.text()).toContain("已复制");
  });
});
