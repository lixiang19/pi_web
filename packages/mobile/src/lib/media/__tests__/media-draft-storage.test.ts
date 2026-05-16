import { describe, expect, it } from "vitest";
import { createMediaDraftStorage } from "@/lib/media/media-draft-storage";

describe("mobile media draft storage", () => {
  it("keeps failed capture drafts queryable for later retry", () => {
    const storage = createMediaDraftStorage();
    const photoAttachment = {
      id: "att-1",
      kind: "photo" as const,
      source: "gallery" as const,
      uri: "file://photo.jpg",
      name: "photo.jpg",
      mimeType: "image/jpeg",
      size: 12,
      base64: "cGhvdG8=",
    };

    storage.saveDraft({
      id: "draft-1",
      text: "现场想法",
      attachments: [photoAttachment],
      createdAt: 1_800_000_000,
      retryState: "pending",
    });

    expect(storage.countPendingDrafts()).toBe(1);
    expect(storage.listDrafts()).toEqual([
      {
        id: "draft-1",
        text: "现场想法",
        attachments: [photoAttachment],
        createdAt: 1_800_000_000,
        retryState: "pending",
      },
    ]);

    storage.removeDraft("draft-1");

    expect(storage.countPendingDrafts()).toBe(0);
  });

  it("removes one attachment without deleting text or other draft attachments", () => {
    const storage = createMediaDraftStorage();
    const audioAttachment = {
      id: "att-audio",
      kind: "audio" as const,
      source: "recorder" as const,
      uri: "blob://audio",
      name: "idea.webm",
      mimeType: "audio/webm",
      size: 5,
      base64: "dm9pY2U=",
    };
    const photoAttachment = {
      id: "att-photo",
      kind: "photo" as const,
      source: "camera" as const,
      uri: "blob://photo",
      name: "photo.png",
      mimeType: "image/png",
      size: 5,
      base64: "cGhvdG8=",
    };

    storage.saveDraft({
      id: "draft-1",
      text: "不要被附件删除影响",
      attachments: [audioAttachment, photoAttachment],
      createdAt: 1_800_000_001,
      retryState: "failed",
      lastError: "offline",
    });

    storage.removeAttachment("draft-1", "att-audio");

    expect(storage.listDrafts()).toEqual([
      {
        id: "draft-1",
        text: "不要被附件删除影响",
        attachments: [photoAttachment],
        createdAt: 1_800_000_001,
        retryState: "failed",
        lastError: "offline",
      },
    ]);
  });
});
