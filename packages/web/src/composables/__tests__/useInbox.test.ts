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

	it("polls while notes are waiting for analysis", async () => {
		vi.useFakeTimers();
		mockGetFleetingNotes.mockResolvedValue({
			notes: [{ ...note, analysisStatus: "unanalyzed" }],
		});
		useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalledTimes(1));
		await vi.advanceTimersByTimeAsync(3000);
		expect(mockGetFleetingNotes).toHaveBeenCalledTimes(2);
	});

	it("keeps retry analysis as the only explicit note action", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		await store.retryAnalysis("flash-1");

		expect(mockTriggerFleetingAnalysis).toHaveBeenCalledWith("flash-1");
		expect(mockGetFleetingNotes).toHaveBeenCalledTimes(2);
	});
});
