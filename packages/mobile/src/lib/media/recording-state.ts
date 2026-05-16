export type MobileRecordingStatus =
  | "idle"
  | "recording"
  | "preview"
  | "uploading"
  | "done"
  | "failed";

export interface MobileRecordingState {
  status: MobileRecordingStatus;
  attachmentId?: string;
  error?: string;
}

export type MobileRecordingEvent =
  | { type: "start" }
  | { type: "preview"; attachmentId: string }
  | { type: "upload" }
  | { type: "done" }
  | { type: "fail"; error: string }
  | { type: "delete" };

export function createInitialRecordingState(): MobileRecordingState {
  return { status: "idle" };
}

export function reduceRecordingState(
  state: MobileRecordingState,
  event: MobileRecordingEvent,
): MobileRecordingState {
  switch (event.type) {
    case "start":
      return { status: "recording" };
    case "preview":
      return { status: "preview", attachmentId: event.attachmentId };
    case "upload":
      return { status: "uploading", attachmentId: state.attachmentId };
    case "done":
      return { status: "done" };
    case "fail":
      return {
        status: "failed",
        attachmentId: state.attachmentId,
        error: event.error,
      };
    case "delete":
      return { status: "idle" };
  }
}
