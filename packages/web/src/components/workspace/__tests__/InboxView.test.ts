import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InboxView from "../InboxView.vue";

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
	uploadFleetingAttachments: vi.fn(),
	getFleetingAttachments: vi.fn(),
}));

import {
	createFleetingNote,
	getFleetingNotes,
	getFleetingAttachments,
	processFleetingToTask,
} from "@/lib/api";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockGetFleetingAttachments = vi.mocked(getFleetingAttachments);
const mockProcessFleetingToTask = vi.mocked(processFleetingToTask);

const note = {
	id: "flash-1",
	content: "明天整理任务系统",
	status: "pending" as const,
	analysisStatus: "suggested" as const,
	recommendationType: "task" as const,
	recommendationText: "建议转为任务",
	draft: "明天整理任务系统",
	requiresInput: false,
	piSessionId: null,
	piSessionFile: null,
	createdAt: Date.now(),
	updatedAt: Date.now(),
};

describe("InboxView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetFleetingNotes.mockResolvedValue({ notes: [note] });
		mockGetFleetingAttachments.mockResolvedValue({ attachments: [] });
		mockCreateFleetingNote.mockResolvedValue({ note });
		mockProcessFleetingToTask.mockResolvedValue({
			processed: false,
			message: "任务系统正在接入中，暂不能从闪念创建任务",
		});
	});

	it("renders DB queue notes and fixed process buttons", async () => {
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		expect(wrapper.text()).toContain("明天整理任务系统");
		expect(wrapper.text()).toContain("建议转为任务");
		expect(wrapper.text()).toContain("日记");
		expect(wrapper.text()).toContain("任务");
		expect(wrapper.text()).toContain("剪藏");
		expect(wrapper.text()).toContain("删除");
	});

	it("captures a new fleeting note without emitting open-file", async () => {
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		await wrapper.get("textarea").setValue("新的闪念");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");

		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念");
		expect(wrapper.emitted("open-file")).toBeUndefined();
	});

	it("keeps a task note in the queue when task system is pending", async () => {
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		expect(wrapper.text()).toContain("明天整理任务系统");
		const taskButton = wrapper
			.findAll("button")
			.find((button) => button.text() === "任务")!;
		await taskButton.trigger("click");

		expect(mockProcessFleetingToTask).toHaveBeenCalledWith("flash-1");
		expect(wrapper.text()).toContain("明天整理任务系统");
	});
});
