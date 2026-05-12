import { afterEach, vi } from "vitest";

// Polyfill EventSource for composables that open SSE streams in tests
class MockEventSource {
  close = vi.fn();
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as Record<string, unknown>)['EventSource'] = MockEventSource;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
