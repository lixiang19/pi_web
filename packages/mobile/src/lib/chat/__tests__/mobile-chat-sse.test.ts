import { describe, expect, it } from "vitest";
import {
  applyMobileChatStreamEvent,
  type MobileChatMessage,
} from "@/lib/chat/mobile-chat-sse";

describe("mobile chat SSE event merge", () => {
  it("merges snapshot, status, assistant message, and errors into mobile state", () => {
    const messages: MobileChatMessage[] = [];

    const snapshot = applyMobileChatStreamEvent(messages, {
      type: "snapshot",
      status: "streaming",
      messages: [
        { role: "user", content: "你好", timestamp: 1 },
      ],
    });
    expect(snapshot.messages).toEqual([
      { id: "snapshot-0", role: "user", content: "你好", timestamp: 1 },
    ]);
    expect(snapshot.status).toBe("streaming");

    const started = applyMobileChatStreamEvent(snapshot.messages, {
      type: "message_start",
      message: { role: "assistant", content: "你", timestamp: 2 },
    });
    expect(started.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "你",
      pending: true,
    });

    const ended = applyMobileChatStreamEvent(started.messages, {
      type: "message_end",
      message: { role: "assistant", content: "你好，已收到", timestamp: 3 },
    });
    expect(ended.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "你好，已收到",
      pending: false,
    });
    expect(ended.status).toBe("idle");

    const errored = applyMobileChatStreamEvent(ended.messages, {
      type: "error",
      error: "network",
    });
    expect(errored.error).toBe("network");
    expect(errored.status).toBe("error");
  });
});
