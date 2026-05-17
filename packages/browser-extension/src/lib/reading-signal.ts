export interface ReadingSignal {
	dwellMs: number;
	maxScrollRatio: number;
	visitCount: number;
}

const MIN_DWELL_MS = 45_000;
const MIN_SCROLL_RATIO = 0.35;
const REVISIT_COUNT = 3;

export function shouldCaptureReading(signal: ReadingSignal): boolean {
	if (signal.dwellMs >= MIN_DWELL_MS && signal.maxScrollRatio >= MIN_SCROLL_RATIO) {
		return true;
	}
	return signal.visitCount >= REVISIT_COUNT && signal.dwellMs >= 15_000;
}
