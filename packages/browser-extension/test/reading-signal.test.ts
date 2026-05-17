import { describe, expect, it } from "vitest";

import { shouldCaptureReading } from "../src/lib/reading-signal";
import { sanitizeUrlForCapture } from "../src/lib/url";

describe("browser reading capture rules", () => {
	it("captures only pages with real dwell and scroll evidence", () => {
		expect(shouldCaptureReading({ dwellMs: 10_000, maxScrollRatio: 0.9, visitCount: 1 })).toBe(false);
		expect(shouldCaptureReading({ dwellMs: 70_000, maxScrollRatio: 0.1, visitCount: 1 })).toBe(false);
		expect(shouldCaptureReading({ dwellMs: 46_000, maxScrollRatio: 0.4, visitCount: 1 })).toBe(true);
		expect(shouldCaptureReading({ dwellMs: 20_000, maxScrollRatio: 0.2, visitCount: 3 })).toBe(true);
	});

	it("removes tracking and sensitive URL parameters before upload", () => {
		expect(
			sanitizeUrlForCapture("https://example.com/a?utm_source=x&token=secret&q=keep#section"),
		).toBe("https://example.com/a?q=keep#section");
	});
});
