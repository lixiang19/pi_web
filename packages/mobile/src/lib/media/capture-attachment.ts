import type {
  MobileMediaDraftAttachment,
  MobileMediaDraftAttachmentSource,
} from "@/lib/media/media-draft-storage";

interface FileToAttachmentOptions {
  source: MobileMediaDraftAttachmentSource;
  createObjectUrl?: (file: File) => string;
  createId?: () => string;
}

function createAttachmentId() {
  return `att-${crypto.randomUUID()}`;
}

function getObjectUrl(file: File) {
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }
  return `memory://${file.name}-${file.size}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(""));
}

export async function fileToMobileCaptureAttachment(
  file: File,
  options: FileToAttachmentOptions,
): Promise<MobileMediaDraftAttachment> {
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const source = options.source;
  return {
    id: options.createId?.() ?? createAttachmentId(),
    kind: source === "recorder" ? "audio" : "photo",
    source,
    uri: options.createObjectUrl?.(file) ?? getObjectUrl(file),
    name: file.name || (source === "recorder" ? "recording.webm" : "photo"),
    mimeType: file.type || (source === "recorder" ? "audio/webm" : "application/octet-stream"),
    size: file.size,
    base64,
  };
}
