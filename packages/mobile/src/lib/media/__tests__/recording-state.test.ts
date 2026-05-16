import { describe, expect, it } from "vitest";
import {
	createInitialRecordingState,
	reduceRecordingState,
} from "@/lib/media/recording-state";

describe("mobile recording state machine", () => {
	it("moves through idle, recording, preview, uploading, done and failed states", () => {
		const idle = createInitialRecordingState();
		expect(idle.status).toBe("idle");

		const recording = reduceRecordingState(idle, { type: "start" });
		expect(recording.status).toBe("recording");

		const preview = reduceRecordingState(recording, {
			type: "preview",
			attachmentId: "att-audio",
		});
		expect(preview).toMatchObject({
			status: "preview",
			attachmentId: "att-audio",
		});

		const uploading = reduceRecordingState(preview, { type: "upload" });
		expect(uploading.status).toBe("uploading");

		const done = reduceRecordingState(uploading, { type: "done" });
		expect(done.status).toBe("done");

		const failed = reduceRecordingState(uploading, {
			type: "fail",
			error: "network down",
		});
		expect(failed).toMatchObject({
			status: "failed",
			error: "network down",
			attachmentId: "att-audio",
		});
	});

	it("returns to idle when a preview recording is deleted", () => {
		const preview = reduceRecordingState(
			reduceRecordingState(createInitialRecordingState(), { type: "start" }),
			{ type: "preview", attachmentId: "att-audio" },
		);

		expect(reduceRecordingState(preview, { type: "delete" })).toEqual({
			status: "idle",
		});
	});
});
