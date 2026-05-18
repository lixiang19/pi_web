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
	deleteFleetingNote: vi.fn(),
	processFleetingToJournal: vi.fn(),
	processFleetingToClip: vi.fn(),
	processFleetingToTask: vi.fn(),
	processFleetingToMilestone: vi.fn(),
	processFleetingToAttachment: vi.fn(),
	uploadFleetingAttachments: vi.fn(),
	getFleetingAttachments: vi.fn(),
	triggerFleetingAnalysis: vi.fn(),
	getProjects: vi.fn(),
}));

import {
	createFleetingNote,
	deleteFleetingNote,
	getFleetingNotes,
	processFleetingToClip,
	processFleetingToJournal,
	processFleetingToTask,
	getFleetingAttachments,
	triggerFleetingAnalysis,
} from "@/lib/api";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockDeleteFleetingNote = vi.mocked(deleteFleetingNote);
const mockProcessFleetingToJournal = vi.mocked(processFleetingToJournal);
const mockProcessFleetingToClip = vi.mocked(processFleetingToClip);
const mockProcessFleetingToTask = vi.mocked(processFleetingToTask);
const mockGetFleetingAttachments = vi.mocked(getFleetingAttachments);
const mockTriggerFleetingAnalysis = vi.mocked(triggerFleetingAnalysis);

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
		mockProcessFleetingToJournal.mockResolvedValue({
			processed: true,
			note: { ...note, status: "processed", updatedAt: 2000 },
			journalPath: "/workspace/日记/2026/05/2026-05-08.md",
		});
		mockProcessFleetingToClip.mockResolvedValue({
			processed: true,
			note: { ...note, status: "processed", updatedAt: 2000 },
			clip: {
				id: "clip-1",
				title: "资料",
				url: null,
				content: "资料",
				source: "闪念",
				createdAt: 1000,
				updatedAt: 1000,
			},
		});
		mockProcessFleetingToTask.mockResolvedValue({
			processed: true,
			note: { ...note, status: "processed", updatedAt: 2000 },
			task: {
				id: "task-1",
				workspacePath: "/workspace",
				projectId: null,
				milestoneId: "milestone-1",
				title: "整理任务系统",
				status: "pending",
				priority: "normal",
				acceptanceCriteria: "完成",
				dueDate: null,
				blockedReason: null,
				processingSessionId: null,
				sortOrder: 0,
				createdAt: 1000,
				updatedAt: 1000,
			},
		});
		mockDeleteFleetingNote.mockResolvedValue({ deleted: true });
		mockTriggerFleetingAnalysis.mockResolvedValue({ triggered: true, note });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads fleeting notes and attachments from DB API", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		await vi.waitFor(() => expect(mockGetFleetingAttachments).toHaveBeenCalledWith("flash-1"));
		expect(store.count.value).toBe(1);
		expect(store.filteredFiles.value[0]?.content).toBe("今天复盘闪念系统");
	});

	it("creates a fleeting note without attachments (immediate analysis)", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		await store.captureNote("新的闪念");
		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念", undefined);
	});

	it("creates a fleeting note with delayed analysis when attachments are present", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		await store.captureNote("新的闪念", true);
		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念", true);
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

	it("keeps a note and drops the pending count after journal processing succeeds", async () => {
		mockProcessFleetingToJournal.mockResolvedValue({
			processed: true,
			note: { ...note, status: "processed", updatedAt: 2000 },
			journalPath: "/workspace/日记/2026/05/2026-05-08.md",
			migratedAttachments: ["/workspace/附件/file.txt"],
		});
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await store.processToJournal("flash-1", "今天复盘闪念系统");
		expect(store.inboxFiles.value).toHaveLength(1);
		expect(store.inboxFiles.value[0]).toMatchObject({ id: "flash-1", status: "processed" });
		expect(store.count.value).toBe(0);
	});

	it("keeps a note after clip processing succeeds", async () => {
		mockProcessFleetingToClip.mockResolvedValue({
			processed: true,
			note: { ...note, status: "processed", updatedAt: 2000 },
			clip: {
				id: "clip-1",
				title: "资料",
				url: null,
				content: "资料",
				source: "闪念",
				createdAt: 1000,
				updatedAt: 1000,
			},
			migratedAttachments: ["/workspace/附件/file.pdf"],
		});
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await store.processToClip("flash-1", { title: "资料", content: "资料" });
		expect(store.inboxFiles.value).toHaveLength(1);
		expect(store.inboxFiles.value[0]).toMatchObject({ id: "flash-1", status: "processed" });
		expect(store.count.value).toBe(0);
	});

	it("creates a task from a note and marks it processed in the queue", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await store.processToTask("flash-1", { title: "整理任务系统", priority: "normal", acceptanceCriteria: "完成" });
		expect(store.inboxFiles.value).toHaveLength(1);
		expect(store.inboxFiles.value[0]).toMatchObject({ id: "flash-1", status: "processed" });
		expect(store.count.value).toBe(0);
		expect(mockProcessFleetingToTask).toHaveBeenCalledWith("flash-1", { title: "整理任务系统", priority: "normal", acceptanceCriteria: "完成" });
	});

	it("restores a note when delete fails", async () => {
		mockDeleteFleetingNote.mockRejectedValue(new Error("delete failed"));
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await expect(store.deleteItem("flash-1")).rejects.toThrow("delete failed");
		expect(store.count.value).toBe(1);
	});
});
