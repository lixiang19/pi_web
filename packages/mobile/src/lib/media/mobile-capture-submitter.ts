import type { MobileApiClient } from "@/lib/api/mobile-api-client";
import type { MobileDeviceStorage } from "@/lib/device/device-storage";
import type {
  MobileMediaDraft,
  MobileMediaDraftAttachment,
  MobileMediaDraftStorage,
} from "@/lib/media/media-draft-storage";

interface MobileCaptureSubmitterOptions {
  api: MobileApiClient;
  deviceStorage: MobileDeviceStorage;
  draftStorage: MobileMediaDraftStorage;
  createDraftId?: () => string;
  now?: () => number;
}

export interface MobileCaptureInput {
  id?: string;
  text: string;
  attachments: MobileMediaDraftAttachment[];
}

export type MobileCaptureSubmitResult =
  | { ok: true; note: unknown; attachments: unknown[] }
  | { ok: false; draft: MobileMediaDraft; error: string };

interface MobileCaptureResponse {
  note: unknown;
  attachments: unknown[];
}

function createDraftId() {
  return `draft-${crypto.randomUUID()}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>)["error"] === "string"
        ? String((body as Record<string, unknown>)["error"])
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "上传失败";
}

export function createMobileCaptureSubmitter(options: MobileCaptureSubmitterOptions) {
  const getNow = options.now ?? Date.now;
  const makeDraftId = options.createDraftId ?? createDraftId;

  const buildDraft = (
    input: MobileCaptureInput,
    retryState: MobileMediaDraft["retryState"],
    lastError?: string,
  ): MobileMediaDraft => ({
    id: input.id ?? makeDraftId(),
    text: input.text,
    attachments: input.attachments,
    createdAt: getNow(),
    retryState,
    ...(lastError ? { lastError } : {}),
  });

  const submitCapture = async (
    input: MobileCaptureInput,
  ): Promise<MobileCaptureSubmitResult> => {
    const uploadingDraft = buildDraft(input, "uploading");
    options.draftStorage.saveDraft(uploadingDraft);

    try {
      const registration = options.deviceStorage.getRegistration();
      if (!registration) {
        throw new Error("Android 设备未注册");
      }

      const response = await options.api.post("/api/mobile/captures", {
        deviceId: registration.deviceId,
        token: registration.token,
        text: input.text,
        attachments: input.attachments.map((attachment) => ({
          kind: attachment.kind,
          name: attachment.name,
          mimeType: attachment.mimeType,
          base64: attachment.base64,
        })),
      });
      const body = await readJson<MobileCaptureResponse>(response);
      options.draftStorage.removeDraft(uploadingDraft.id);
      return { ok: true, note: body.note, attachments: body.attachments };
    } catch (error) {
      const failedDraft = {
        ...uploadingDraft,
        retryState: "failed" as const,
        lastError: getErrorMessage(error),
      };
      options.draftStorage.saveDraft(failedDraft);
      return {
        ok: false,
        draft: failedDraft,
        error: failedDraft.lastError,
      };
    }
  };

  return {
    submitCapture,
    retryDraft(id: string) {
      const draft = options.draftStorage.listDrafts().find((item) => item.id === id);
      if (!draft) {
        throw new Error("本地草稿不存在");
      }
      return submitCapture(draft);
    },
  };
}
