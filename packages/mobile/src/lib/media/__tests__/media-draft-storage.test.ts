import { describe, expect, it } from "vitest";
import { createMediaDraftStorage } from "@/lib/media/media-draft-storage";

describe("mobile media draft storage", () => {
  it("keeps failed capture drafts queryable for later retry", () => {
    const storage = createMediaDraftStorage();

    storage.saveDraft({
      id: "draft-1",
      text: "现场想法",
      attachments: [{ id: "att-1", kind: "photo", uri: "file://photo.jpg" }],
      createdAt: 1_800_000_000,
      retryState: "pending",
    });

    expect(storage.countPendingDrafts()).toBe(1);
    expect(storage.listDrafts()).toEqual([
      {
        id: "draft-1",
        text: "现场想法",
        attachments: [{ id: "att-1", kind: "photo", uri: "file://photo.jpg" }],
        createdAt: 1_800_000_000,
        retryState: "pending",
      },
    ]);

    storage.removeDraft("draft-1");

    expect(storage.countPendingDrafts()).toBe(0);
  });
});
