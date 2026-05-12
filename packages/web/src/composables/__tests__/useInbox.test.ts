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
}));

import {
	createFleetingNote,
	deleteFleetingNote,
	getFleetingNotes,
	processFleetingToClip,
	processFleetingToJournal,
	processFleetingToTask,
} from "@/lib/api";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockDeleteFleetingNote = vi.mocked(deleteFleetingNote);
const mockProcessFleetingToJournal = vi.mocked(processFleetingToJournal);
const mockProcessFleetingToClip = vi.mocked(processFleetingToClip);
const mockProcessFleetingToTask = vi.mocked(processFleetingToTask);

const note = {
	id: "flash-1",
	content: "今天复盘闪念系统",
	status: "pending" as const,
	analysisStatus: "suggested" as const,
	recommendationType: "journal" as const,
	recommendationText: "建议写入今天日记",
	draft: "今天复盘闪念系统",
	requiresInput: false,
	piSessionId: null,
	piSessionFile: null,
	createdAt: 1000,
	updatedAt: 1000,
};

describe("useWorkspaceInbox", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetFleetingNotes.mockResolvedValue({ notes: [note] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads fleeting notes from DB API", async () => {
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		expect(store.count.value).toBe(1);
		expect(store.filteredFiles.value[0]?.content).toBe("今天复盘闪念系统");
	});

	it("creates a fleeting note without opening a file", async () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		mockCreateFleetingNote.mockResolvedValue({ note });
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		await store.captureNote("新的闪念");
		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念");
		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({ type: "ridge:fleeting-created" }),
		);
		dispatchSpy.mockRestore();
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

	it("removes a note after journal processing succeeds", async () => {
		mockProcessFleetingToJournal.mockResolvedValue({
			deleted: true,
			journalPath: "/workspace/日记/2026/05/2026-05-08.md",
		});
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await store.processToJournal("flash-1", "今天复盘闪念系统");
		expect(store.count.value).toBe(0);
	});

	it("removes a note after clip processing succeeds", async () => {
		mockProcessFleetingToClip.mockResolvedValue({
			deleted: true,
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
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await store.processToClip("flash-1", { title: "资料", content: "资料" });
		expect(store.count.value).toBe(0);
	});

	it("keeps a note when task processing reports pending integration", async () => {
		mockProcessFleetingToTask.mockResolvedValue({
			processed: false,
			message: "任务系统正在接入中，暂不能从闪念创建任务",
		});
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await store.processToTask("flash-1");
		expect(store.count.value).toBe(1);
	});

	it("restores a note when delete fails", async () => {
		mockDeleteFleetingNote.mockRejectedValue(new Error("delete failed"));
		const store = useWorkspaceInbox(() => "/workspace");
		await vi.waitFor(() => expect(store.count.value).toBe(1));
		await expect(store.deleteItem("flash-1")).rejects.toThrow("delete failed");
		expect(store.count.value).toBe(1);
	});
});
