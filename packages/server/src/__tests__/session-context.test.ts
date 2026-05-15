import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../types/index.js";
import { destroySessionRecord, initSessionContext } from "../session-context.js";

describe("destroySessionRecord", () => {
	it("disposes the underlying Pi agent session", () => {
		const dispose = vi.fn();
		const activeSessions = new Map<string, SessionRecord>();
		const openingSessionRecords = new Map<string, Promise<SessionRecord>>();
		const record = {
			id: "session-dispose",
			session: { dispose },
			unsubscribe: vi.fn(),
			clients: new Set(),
			pendingAskRecords: new Map(),
			pendingPermissionRecords: new Map(),
			runtimePermissionRules: {},
		} as unknown as SessionRecord;
		activeSessions.set(record.id, record);
		openingSessionRecords.set(record.id, Promise.resolve(record));

		initSessionContext({
			activeSessions,
			openingSessionRecords,
		} as unknown as Parameters<typeof initSessionContext>[0]);

		destroySessionRecord(record);

		expect(dispose).toHaveBeenCalledTimes(1);
		expect(activeSessions.has(record.id)).toBe(false);
		expect(openingSessionRecords.has(record.id)).toBe(false);
	});
});
