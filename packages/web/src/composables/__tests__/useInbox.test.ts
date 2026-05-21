import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceInbox } from "@/composables/useInbox";

vi.mock("vue-sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock("@/lib/api", () => ({
	getFleetingNotes: vi.fn(),
	createFleetingNote: vi.fn(),
	uploadFleetingAttachments: vi.fn(),
	getFleetingAttachments: vi.fn(),
	triggerFleetingAnalysis: vi.fn(),
	getProjects: vi.fn(),
}));

import {
	createFleetingNote,
	getFleetingAttachments,
	getFleetingNotes,
	triggerFleetingAnalysis,
	uploadFleetingAttachments,
} from "@/lib/api";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockGetFleetingAttachments = vi.mocked(getFleetingAttachments);
const mockTriggerFleetingAnalysis = vi.mocked(triggerFleetingAnalysis);
const mockUploadFleetingAttachments = vi.mocked(uploadFleetingAttachments);

class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	close = vi.fn();
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	emit(payload: unknown) {
		this.onmessage?.({ data: JSON.stringify(payload) });
	}
}

const note = {
	id: "flash-1",
	content: "今天复盘闪念系统",
	status: "pending" as const,
	analysisStatus: "suggested" as const,
	recommendationType: "journal" as const,
	recommendationText: "建议写入今天日记",
	draft: "今天复盘闪念系统",
	requiresInput: false,
	lastError: null,
	retryCount: 0,
	piSessionId: null,
	piSessionFile: null,
	createdAt: 1000,
	updatedAt: 1000,
};

describe("useWorkspaceInbox", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		MockEventSource.instances = [];
		(globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
		mockGetFleetingNotes.mockResolvedValue({ notes: [note] });
		mockGetFleetingAttachments.mockResolvedValue({ attachments: [] });
		mockCreateFleetingNote.mockResolvedValue({ note });
		mockUploadFleetingAttachments.mockResolvedValue({ attachments: [] });
		mockTriggerFleetingAnalysis.mockResolvedValue({ triggered: true, note });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads fleeting notes and attachments from the DB API", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		await vi.waitFor(() => expect(mockGetFleetingAttachments).toHaveBeenCalledWith("flash-1"));
		expect(store.count.value).toBe(1);
		expect(store.filteredFiles.value[0]?.content).toBe("今天复盘闪念系统");
	});

	it("creates a text fleeting note and lets backend analysis run immediately", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		await store.captureNote("新的闪念");
		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念", undefined);
	});

	it("creates a delayed-analysis note when attachments are uploaded separately", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		await store.captureNote("新的闪念", true);
		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念", true);
	});

	it("uploads attachments without exposing manual processing actions", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		const file = new File(["hello"], "note.txt", { type: "text/plain" });
		await store.uploadAttachments("flash-1", [file]);

		expect(mockUploadFleetingAttachments).toHaveBeenCalledWith("flash-1", [file]);
		expect("processToJournal" in store).toBe(false);
		expect("processToClip" in store).toBe(false);
		expect("processToTask" in store).toBe(false);
		expect("deleteItem" in store).toBe(false);
	});

	it("opens the fleeting event stream when the workspace is available", async () => {
		useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1));
		expect(MockEventSource.instances.at(-1)?.url).toBe("/api/fleeting/events");
	});

	it("does not poll unanalyzed or analyzing notes", async () => {
		vi.useFakeTimers();
		mockGetFleetingNotes.mockResolvedValue({
			notes: [
				{ ...note, id: "flash-1", analysisStatus: "unanalyzed" },
				{ ...note, id: "flash-2", analysisStatus: "analyzing" },
			],
		});
		useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1);
	});

	it("updates a note from the fleeting event stream without reloading the list", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingAttachments).toHaveBeenCalledTimes(1));

		MockEventSource.instances.at(-1)?.emit({
			type: "fleeting.note.updated",
			note: {
				...note,
				status: "processed",
				analysisStatus: "processed",
				recommendationText: "已经沉淀到剪藏",
			},
		});

		expect(store.inboxFiles.value[0]?.status).toBe("processed");
		expect(store.inboxFiles.value[0]?.analysisStatus).toBe("processed");
		expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1);
		expect(mockGetFleetingAttachments).toHaveBeenCalledTimes(1);
	});

	it("updates local state from retry response without reloading or polling", async () => {
		mockGetFleetingNotes.mockResolvedValue({
			notes: [{ ...note, analysisStatus: "failed", lastError: "boom" }],
		});
		mockTriggerFleetingAnalysis.mockResolvedValue({
			triggered: true,
			note: { ...note, analysisStatus: "unanalyzed", lastError: null },
		});
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1));

		await store.retryAnalysis("flash-1");

		expect(mockTriggerFleetingAnalysis).toHaveBeenCalledWith("flash-1");
		expect(store.inboxFiles.value[0]?.analysisStatus).toBe("unanalyzed");
		expect(store.inboxFiles.value[0]?.lastError).toBeNull();
		expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1);
	});

	it("keeps retry analysis as the only explicit note action", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		await store.retryAnalysis("flash-1");

		expect(mockTriggerFleetingAnalysis).toHaveBeenCalledWith("flash-1");
		expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1);
	});
});
