import { describe, expect, it, vi, beforeEach } from "vitest";
import { captureFromDesktop, type DesktopCapturePayload } from "@/lib/api";

describe("captureFromDesktop", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("sends a capture payload with text type", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({
				note: {
					id: "flash-123",
					content: "桌面文字",
					status: "pending",
					analysisStatus: "unanalyzed",
					captureType: "text",
					metadata: {},
					createdAt: 1,
					updatedAt: 1,
				},
				attachments: [],
			}), { status: 200 }),
		);

		const payload: DesktopCapturePayload = {
			content: "桌面文字",
			type: "text",
		};

		await captureFromDesktop(payload);

		const lastCall = fetchSpy.mock.lastCall;
		expect(lastCall).toBeDefined();
		const [, init] = lastCall!;
		expect((init as RequestInit).method).toBe("POST");
		expect((init as RequestInit).body).toBe(JSON.stringify(payload));
	});

	it("sends a capture payload with screenshot metadata", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({
				note: {
					id: "flash-456",
					content: "",
					status: "pending",
					analysisStatus: "unanalyzed",
					captureType: "screenshot_region",
					metadata: {},
					createdAt: 1,
					updatedAt: 1,
				},
				attachments: [
					{
						id: "fla-1",
						noteId: "flash-456",
						originalName: "screenshot.png",
						storedName: "fla-1-screenshot.png",
						mimeType: "image/png",
						size: 100,
						sha256: "abc",
						createdAt: 1,
					},
				],
			}), { status: 200 }),
		);

		const payload: DesktopCapturePayload = {
			content: "",
			type: "screenshot_region",
			attachments: [
				{ name: "screenshot.png", mimeType: "image/png", base64: "fakebase64" },
			],
		};

		await captureFromDesktop(payload);

		const lastCall = fetchSpy.mock.lastCall;
		expect(lastCall).toBeDefined();
		const [, init] = lastCall!;
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.type).toBe("screenshot_region");
		expect(body.attachments).toHaveLength(1);
		expect(body.attachments[0].base64).toBe("fakebase64");
	});
});
