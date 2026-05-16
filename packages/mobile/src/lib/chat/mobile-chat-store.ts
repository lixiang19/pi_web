import { reactive } from "vue";
import type { MobileMediaDraftAttachment } from "@/lib/media/media-draft-storage";
import type {
  MobileChatAttachmentUploadResponse,
  MobileChatMessagesPayload,
  MobileChatSessionSummary,
} from "@/lib/chat/mobile-chat-api-client";
import type { MobileChatDraftStorage } from "@/lib/chat/mobile-chat-draft-storage";
import {
  applyMobileChatStreamEvent,
  type MobileChatMessage,
  type MobileChatStatus,
  type MobileChatStreamEvent,
} from "@/lib/chat/mobile-chat-sse";

export interface MobileChatApi {
  listSessions(): Promise<MobileChatSessionSummary[]>;
  createSession(): Promise<MobileChatSessionSummary>;
  getMessages(sessionId: string): Promise<MobileChatMessagesPayload>;
  uploadAttachments(
    sessionId: string,
    attachments: MobileMediaDraftAttachment[],
  ): Promise<MobileChatAttachmentUploadResponse>;
  sendMessage(
    sessionId: string,
    payload: { prompt: string; attachmentIds?: string[] },
  ): Promise<{ ok: true }>;
  cancelSession(sessionId: string): Promise<{ ok: true }>;
}

export interface MobileChatComposerState {
  text: string;
  attachments: MobileMediaDraftAttachment[];
}

export interface MobileChatStore {
  sessions: MobileChatSessionSummary[];
  selectedSessionId: string;
  messages: MobileChatMessage[];
  composer: MobileChatComposerState;
  isLoading: boolean;
  isSending: boolean;
  status: MobileChatStatus;
  error: string;
  loadSessions(): Promise<void>;
  createSession(): Promise<string>;
  selectSession(sessionId: string): Promise<void>;
  send(): Promise<void>;
  cancel(): Promise<void>;
  removeAttachment(attachmentId: string): void;
  addAttachment(attachment: MobileMediaDraftAttachment): void;
  applyStreamEvent(event: MobileChatStreamEvent): void;
}

export interface MobileChatStoreOptions {
  api: MobileChatApi;
  draftStorage: MobileChatDraftStorage;
}

function mapMessages(payload: MobileChatMessagesPayload): MobileChatMessage[] {
  return payload.messages.map((message, index) => ({
    id: `stored-${index}`,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp ?? Date.now(),
  }));
}

export function createMobileChatStore(
  options: MobileChatStoreOptions,
): MobileChatStore {
  const savedDraft = options.draftStorage.loadDraft();
  let pendingDraft: MobileChatComposerState | null = null;

  const store = reactive({
    sessions: [],
    selectedSessionId: "",
    messages: [],
    composer: {
      text: savedDraft?.text ?? "",
      attachments: savedDraft?.attachments ?? [],
    },
    isLoading: false,
    isSending: false,
    status: "idle",
    error: "",

    async loadSessions() {
      store.isLoading = true;
      store.error = "";
      try {
        store.sessions = await options.api.listSessions();
      } catch (error) {
        store.error = error instanceof Error ? error.message : String(error);
      } finally {
        store.isLoading = false;
      }
    },

    async createSession() {
      store.error = "";
      const session = await options.api.createSession();
      store.sessions = [
        session,
        ...store.sessions.filter((item) => item.id !== session.id),
      ];
      store.selectedSessionId = session.id;
      store.messages = [];
      return session.id;
    },

    async selectSession(sessionId) {
      store.error = "";
      store.selectedSessionId = sessionId;
      const payload = await options.api.getMessages(sessionId);
      store.messages = mapMessages(payload);
    },

    async send() {
      const prompt = store.composer.text.trim();
      if (!prompt || store.isSending) return;

      const sessionId = store.selectedSessionId || await store.createSession();
      const draft = {
        text: store.composer.text,
        attachments: [...store.composer.attachments],
      };
      pendingDraft = draft;
      options.draftStorage.saveDraft({
        ...draft,
        updatedAt: Date.now(),
      });

      store.error = "";
      store.isSending = true;
      store.status = "streaming";
      store.messages = [
        ...store.messages,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: prompt,
          timestamp: Date.now(),
        },
      ];
      store.composer.text = "";
      store.composer.attachments = [];

      try {
        const uploadResult =
          draft.attachments.length > 0
            ? await options.api.uploadAttachments(sessionId, draft.attachments)
            : { attachments: [] };
        const attachmentIds = uploadResult.attachments.map((attachment) => attachment.id);
        await options.api.sendMessage(sessionId, {
          prompt,
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        });
      } catch (error) {
        store.error = error instanceof Error ? error.message : String(error);
        store.status = "error";
        store.isSending = false;
        store.composer.text = draft.text;
        store.composer.attachments = draft.attachments;
        options.draftStorage.saveDraft({ ...draft, updatedAt: Date.now() });
      }
    },

    async cancel() {
      if (!store.selectedSessionId) return;
      await options.api.cancelSession(store.selectedSessionId);
      store.isSending = false;
      store.status = "idle";
      if (pendingDraft) {
        store.composer.text = pendingDraft.text;
        store.composer.attachments = pendingDraft.attachments;
      }
    },

    removeAttachment(attachmentId) {
      store.composer.attachments = store.composer.attachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
    },

    addAttachment(attachment) {
      store.composer.attachments = [...store.composer.attachments, attachment];
    },

    applyStreamEvent(event) {
      const patch = applyMobileChatStreamEvent(store.messages, event);
      store.messages = patch.messages;
      if (patch.status) {
        store.status = patch.status;
        store.isSending = patch.status === "streaming";
      }
      if (patch.error) {
        store.error = patch.error;
        if (pendingDraft) {
          store.composer.text = pendingDraft.text;
          store.composer.attachments = pendingDraft.attachments;
        }
      }
      if (patch.hasFinalAssistantMessage) {
        pendingDraft = null;
        options.draftStorage.clearDraft();
        store.isSending = false;
      }
    },
  }) as MobileChatStore;

  return store;
}
