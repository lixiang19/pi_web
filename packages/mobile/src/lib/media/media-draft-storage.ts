export const MOBILE_MEDIA_DRAFTS_STORAGE_KEY = "ridge.mobile.mediaDrafts";

export type MobileMediaDraftRetryState = "pending" | "uploading" | "failed";
export type MobileMediaDraftAttachmentKind = "photo" | "audio";
export type MobileMediaDraftAttachmentSource = "camera" | "gallery" | "recorder";

export interface MobileMediaDraftAttachment {
  id: string;
  kind: MobileMediaDraftAttachmentKind;
  source: MobileMediaDraftAttachmentSource;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  base64: string;
}

export interface MobileMediaDraft {
  id: string;
  text: string;
  attachments: MobileMediaDraftAttachment[];
  createdAt: number;
  retryState: MobileMediaDraftRetryState;
  lastError?: string;
}

export interface MobileMediaDraftStorage {
  listDrafts(): MobileMediaDraft[];
  saveDraft(draft: MobileMediaDraft): void;
  removeDraft(id: string): void;
  removeAttachment(draftId: string, attachmentId: string): void;
  countPendingDrafts(): number;
}

function isAttachment(value: unknown): value is MobileMediaDraftAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["id"] === "string" &&
    (candidate["kind"] === "photo" || candidate["kind"] === "audio") &&
    (candidate["source"] === "camera" ||
      candidate["source"] === "gallery" ||
      candidate["source"] === "recorder") &&
    typeof candidate["uri"] === "string" &&
    typeof candidate["name"] === "string" &&
    typeof candidate["mimeType"] === "string" &&
    typeof candidate["size"] === "number" &&
    typeof candidate["base64"] === "string"
  );
}

function isDraft(value: unknown): value is MobileMediaDraft {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["id"] === "string" &&
    typeof candidate["text"] === "string" &&
    typeof candidate["createdAt"] === "number" &&
    (candidate["retryState"] === "pending" ||
      candidate["retryState"] === "uploading" ||
      candidate["retryState"] === "failed") &&
    Array.isArray(candidate["attachments"]) &&
    candidate["attachments"].every(isAttachment) &&
    (candidate["lastError"] === undefined || typeof candidate["lastError"] === "string")
  );
}

export function createMediaDraftStorage(
  storage: Storage = window.localStorage,
): MobileMediaDraftStorage {
  const listDrafts = () => {
    const raw = storage.getItem(MOBILE_MEDIA_DRAFTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDraft) : [];
  };

  const writeDrafts = (drafts: MobileMediaDraft[]) => {
    storage.setItem(MOBILE_MEDIA_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  };

  return {
    listDrafts,
    saveDraft(draft) {
      writeDrafts([
        ...listDrafts().filter((existing) => existing.id !== draft.id),
        draft,
      ]);
    },
    removeDraft(id) {
      writeDrafts(listDrafts().filter((draft) => draft.id !== id));
    },
    removeAttachment(draftId, attachmentId) {
      writeDrafts(
        listDrafts().map((draft) =>
          draft.id === draftId
            ? {
                ...draft,
                attachments: draft.attachments.filter(
                  (attachment) => attachment.id !== attachmentId,
                ),
              }
            : draft,
        ),
      );
    },
    countPendingDrafts() {
      return listDrafts().filter((draft) => draft.retryState !== "uploading")
        .length;
    },
  };
}
