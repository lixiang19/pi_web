import type { MobileMediaDraftAttachment } from "@/lib/media/media-draft-storage";

export const MOBILE_CHAT_DRAFT_STORAGE_KEY = "ridge.mobile.chatDraft";

export interface MobileChatDraft {
  text: string;
  attachments: MobileMediaDraftAttachment[];
  updatedAt: number;
}

export interface MobileChatDraftStorage {
  loadDraft(): MobileChatDraft | null;
  saveDraft(draft: MobileChatDraft): void;
  clearDraft(): void;
}

function isAttachment(value: unknown): value is MobileMediaDraftAttachment {
  if (!value || typeof value !== "object") return false;
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

function isDraft(value: unknown): value is MobileChatDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["text"] === "string" &&
    typeof candidate["updatedAt"] === "number" &&
    Array.isArray(candidate["attachments"]) &&
    candidate["attachments"].every(isAttachment)
  );
}

export function createMobileChatDraftStorage(
  storage: Storage = window.localStorage,
): MobileChatDraftStorage {
  return {
    loadDraft() {
      const raw = storage.getItem(MOBILE_CHAT_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isDraft(parsed) ? parsed : null;
    },
    saveDraft(draft) {
      storage.setItem(MOBILE_CHAT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    },
    clearDraft() {
      storage.removeItem(MOBILE_CHAT_DRAFT_STORAGE_KEY);
    },
  };
}
