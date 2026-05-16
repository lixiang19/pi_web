import { describe, expect, it, vi } from "vitest";
import { createDeviceStorage } from "@/lib/device/device-storage";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import { createMediaDraftStorage } from "@/lib/media/media-draft-storage";
import { createMobileCaptureSubmitter } from "@/lib/media/mobile-capture-submitter";

const photoAttachment = {
	id: "att-photo",
	kind: "photo" as const,
	source: "gallery" as const,
	uri: "blob://photo",
	name: "photo.png",
	mimeType: "image/png",
	size: 5,
	base64: "cGhvdG8=",
};

describe("mobile capture submitter", () => {
	it("posts text and attachments with Android registration and clears the draft after success", async () => {
		window.localStorage.setItem("ridge.mobile.serviceBaseUrl", "https://ridge.example.com");
		const deviceStorage = createDeviceStorage();
		deviceStorage.saveRegistration({
			deviceId: "android-capture",
			token: "rdt_capture",
			name: "Pixel",
		});
		const fetcher = vi.spyOn(window, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					note: { id: "flash-1", content: "现场想法" },
					attachments: [{ id: "fla-1" }],
				}),
				{ status: 201, headers: { "Content-Type": "application/json" } },
			),
		);
		const draftStorage = createMediaDraftStorage();
		const submitter = createMobileCaptureSubmitter({
			api: createMobileApiClient(),
			deviceStorage,
			draftStorage,
			createDraftId: () => "draft-success",
			now: () => 1_800_000_000,
		});

		const result = await submitter.submitCapture({
			text: "现场想法",
			attachments: [photoAttachment],
		});

		expect(result.ok).toBe(true);
		expect(fetcher).toHaveBeenCalledWith(
			"https://ridge.example.com/api/mobile/captures",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					deviceId: "android-capture",
					token: "rdt_capture",
					text: "现场想法",
					attachments: [
						{
							kind: "photo",
							name: "photo.png",
							mimeType: "image/png",
							base64: "cGhvdG8=",
						},
					],
				}),
			}),
		);
		expect(draftStorage.listDrafts()).toEqual([]);
	});

	it("keeps the local draft when upload fails so it can be retried manually", async () => {
		window.localStorage.setItem("ridge.mobile.serviceBaseUrl", "https://ridge.example.com");
		const deviceStorage = createDeviceStorage();
		deviceStorage.saveRegistration({
			deviceId: "android-capture",
			token: "rdt_capture",
			name: "Pixel",
		});
		vi.spyOn(window, "fetch").mockRejectedValue(new Error("offline"));
		const draftStorage = createMediaDraftStorage();
		const submitter = createMobileCaptureSubmitter({
			api: createMobileApiClient(),
			deviceStorage,
			draftStorage,
			createDraftId: () => "draft-failed",
			now: () => 1_800_000_000,
		});

		const result = await submitter.submitCapture({
			text: "断网录音",
			attachments: [photoAttachment],
		});

		expect(result.ok).toBe(false);
		expect(draftStorage.listDrafts()).toEqual([
			{
				id: "draft-failed",
				text: "断网录音",
				attachments: [photoAttachment],
				createdAt: 1_800_000_000,
				retryState: "failed",
				lastError: "offline",
			},
		]);
	});
});
