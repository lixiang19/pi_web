import { describe, expect, it, vi } from "vitest";
import { fileToMobileCaptureAttachment } from "@/lib/media/capture-attachment";

describe("mobile capture attachment conversion", () => {
	it("turns camera and gallery files into pending photo attachments", async () => {
		const photo = new File(["photo-bytes"], "photo.png", { type: "image/png" });

		const attachment = await fileToMobileCaptureAttachment(photo, {
			source: "camera",
			createObjectUrl: () => "blob://photo-preview",
			createId: () => "att-photo",
		});

		expect(attachment).toEqual({
			id: "att-photo",
			kind: "photo",
			source: "camera",
			uri: "blob://photo-preview",
			name: "photo.png",
			mimeType: "image/png",
			size: photo.size,
			base64: "cGhvdG8tYnl0ZXM=",
		});
	});

	it("turns recorder files into pending audio attachments", async () => {
		const audio = new File(["voice"], "idea.webm", { type: "audio/webm" });

		const attachment = await fileToMobileCaptureAttachment(audio, {
			source: "recorder",
			createObjectUrl: vi.fn(() => "blob://voice-preview"),
			createId: () => "att-audio",
		});

		expect(attachment.kind).toBe("audio");
		expect(attachment.source).toBe("recorder");
		expect(attachment.base64).toBe("dm9pY2U=");
	});
});
