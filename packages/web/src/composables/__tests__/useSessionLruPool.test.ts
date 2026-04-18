import { beforeEach, describe, expect, it } from "vitest";
import {
  resetSessionLruPoolForTest,
  useSessionLruPool,
} from "@/composables/useSessionLruPool";

describe("useSessionLruPool", () => {
  beforeEach(() => {
    resetSessionLruPoolForTest();
  });

  it("activates a session and stores it at the head of the pool", () => {
    const lru = useSessionLruPool();

    lru.activateSession("session-1");

    expect(lru.pool.value.map((entry) => entry.sessionId)).toEqual(["session-1"]);
    expect(lru.activeSessionId.value).toBe("session-1");
    expect(lru.isViewingDraft.value).toBe(false);
  });

  it("creates a fresh draft view every time activateDraft is called", () => {
    const lru = useSessionLruPool();

    lru.activateDraft({ cwd: "/tmp/a", parentSessionId: "parent-1" });
    const firstKey = lru.draftView.value?.key;

    lru.activateDraft({ cwd: "/tmp/b" });
    const secondDraft = lru.draftView.value;

    expect(secondDraft?.key).not.toBe(firstKey);
    expect(secondDraft?.cwd).toBe("/tmp/b");
    expect(lru.activeSessionId.value).toBeNull();
    expect(lru.isViewingDraft.value).toBe(true);
  });

  it("promotes the current draft into the pool without dropping the draft handle", () => {
    const lru = useSessionLruPool();

    lru.activateDraft({ cwd: "/tmp/a", parentSessionId: "parent-1" });
    const draftKey = lru.draftView.value?.key;

    lru.promoteDraftToSession("session-1");

    expect(lru.draftView.value?.key).toBe(draftKey);
    expect(lru.draftView.value?.sessionId).toBe("session-1");
    expect(lru.activeSessionId.value).toBe("session-1");
    expect(lru.pool.value.map((entry) => entry.sessionId)).toEqual(["session-1"]);
    expect(lru.isViewingDraft.value).toBe(false);
  });

  it("evicts the oldest non-streaming session when the pool is full", () => {
    const lru = useSessionLruPool();

    ["s1", "s2", "s3", "s4", "s5"].forEach((sessionId) => {
      lru.activateSession(sessionId);
    });

    lru.activateSession("s6");

    expect(lru.pool.value.map((entry) => entry.sessionId)).toEqual([
      "s6",
      "s5",
      "s4",
      "s3",
      "s2",
    ]);
  });

  it("keeps streaming sessions and allows temporary overflow", () => {
    const lru = useSessionLruPool();

    ["s1", "s2", "s3", "s4", "s5"].forEach((sessionId) => {
      lru.activateSession(sessionId);
      lru.setStreaming(sessionId, true);
    });

    lru.activateSession("s6");

    expect(lru.pool.value).toHaveLength(6);
    expect(lru.pool.value[0]?.sessionId).toBe("s6");
  });
});
