import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
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
	patchFleetingNote: vi.fn(),
}));

import {
	createFleetingNote,
	getFleetingNotes,
	processFleetingToTask,
} from "@/lib/api";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockProcessFleetingToTask = vi.mocked(processFleetingToTask);

const note = {
	id: "flash-1",
	content: "明天整理任务系统",
	status: "pending" as const,
	analysisStatus: "suggested" as const,
	type: "text" as const,
	suggestion: null,
	recommendationType: "task" as const,
	recommendationText: "建议转为任务",
	draft: "明天整理任务系统",
	requiresInput: false,
	piSessionId: null,
	piSessionFile: null,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	attachments: [],
};

const noteWithAttachment = {
	...note,
	id: "flash-2",
	content: "带附件的闪念",
	attachments: [
		{
			id: "att-1",
			originalName: "doc.pdf",
			storedName: "doc-abc123.pdf",
			mimeType: "application/pdf",
			size: 1024,
			sha256: "sha256",
			createdAt: Date.now(),
		},
	],
};

describe("InboxView", () => {
	let wrappers: ReturnType<typeof mount>[] = [];

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetFleetingNotes.mockResolvedValue({ notes: [note] });
		mockCreateFleetingNote.mockResolvedValue({ note });
		mockProcessFleetingToTask.mockResolvedValue({
			processed: false,
			message: "任务系统正在接入中，暂不能从闪念创建任务",
		});
		wrappers = [];
	});

	afterEach(() => {
		for (const w of wrappers) {
			w.unmount();
		}
		wrappers = [];
	});

	const mountInbox = (props: { workspaceDir: string }) => {
		const w = mount(InboxView, {
			props,
			attachTo: document.body,
		});
		wrappers.push(w);
		return w;
	};

	it("renders DB queue notes and fixed process buttons", async () => {
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		expect(wrapper.text()).toContain("明天整理任务系统");
		expect(wrapper.text()).toContain("建议转为任务");
		expect(wrapper.text()).toContain("日记");
		expect(wrapper.text()).toContain("任务");
		expect(wrapper.text()).toContain("剪藏");
		expect(wrapper.text()).toContain("删除");
		// UI title should be 闪念, not 收件箱
		expect(wrapper.text()).toContain("闪念");
	});

	it("captures a new fleeting note without emitting open-file", async () => {
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		await wrapper.get("textarea").setValue("新的闪念");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");

		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念", []);
		expect(wrapper.emitted("open-file")).toBeUndefined();
	});

	it("captures note even when workspaceDir is empty", async () => {
		mockGetFleetingNotes.mockResolvedValue({ notes: [] });
		const wrapper = mountInbox({ workspaceDir: "" });

		await wrapper.get("textarea").setValue("无 workspace 也能保存");
		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");

		expect(mockCreateFleetingNote).toHaveBeenCalledWith("无 workspace 也能保存", []);
	});

	it("captures note with attachments even when workspaceDir is empty", async () => {
		mockGetFleetingNotes.mockResolvedValue({ notes: [] });
		const wrapper = mountInbox({ workspaceDir: "" });

		const fileInput = wrapper.find('input[type="file"]');
		const file = new File(["screenshot"], "screen.png", { type: "image/png" });
		Object.defineProperty(fileInput.element, "files", {
			value: [file],
			writable: false,
		});
		await fileInput.trigger("change");

		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");

		expect(mockCreateFleetingNote).toHaveBeenCalledWith(
			"",
			expect.arrayContaining([expect.objectContaining({ name: "screen.png" })]),
		);
	});

	it("captures a fleeting note with attachments", async () => {
		mockGetFleetingNotes.mockResolvedValue({ notes: [] });
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		await wrapper.get("textarea").setValue("带附件的闪念");

		// Simulate file selection
		const fileInput = wrapper.find('input[type="file"]');
		const file = new File(["content"], "test.txt", { type: "text/plain" });
		Object.defineProperty(fileInput.element, "files", {
			value: [file],
			writable: false,
		});
		await fileInput.trigger("change");

		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");

		expect(mockCreateFleetingNote).toHaveBeenCalledWith(
			"带附件的闪念",
			expect.arrayContaining([expect.objectContaining({ name: "test.txt" })]),
		);
	});

	it("allows saving only attachments without text", async () => {
		mockGetFleetingNotes.mockResolvedValue({ notes: [] });
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());

		// Select file without entering text
		const fileInput = wrapper.find('input[type="file"]');
		const file = new File(["screenshot"], "screenshot.png", { type: "image/png" });
		Object.defineProperty(fileInput.element, "files", {
			value: [file],
			writable: false,
		});
		await fileInput.trigger("change");

		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		expect(saveButton.attributes("disabled")).toBeUndefined();
	});

	it("keeps attachments when save fails", async () => {
		mockCreateFleetingNote.mockRejectedValue(new Error("upload failed"));
		mockGetFleetingNotes.mockResolvedValue({ notes: [] });
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		await wrapper.get("textarea").setValue("保存失败测试");

		const fileInput = wrapper.find('input[type="file"]');
		const file = new File(["content"], "keep.txt", { type: "text/plain" });
		Object.defineProperty(fileInput.element, "files", {
			value: [file],
			writable: false,
		});
		await fileInput.trigger("change");

		const saveButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("保存"))!;
		await saveButton.trigger("click");

		await vi.waitFor(() => expect(mockCreateFleetingNote).toHaveBeenCalled());
		// After failure, attachment should still be in the list
		expect(wrapper.text()).toContain("keep.txt");
	});

	it("shows attachment count and names in note list", async () => {
		mockGetFleetingNotes.mockResolvedValue({ notes: [noteWithAttachment] });
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(wrapper.text()).toContain("带附件的闪念"));
		expect(wrapper.text()).toContain("1 个附件");
		expect(wrapper.text()).toContain("doc.pdf");
	});

	it("keeps a task note in the queue when task system is pending", async () => {
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(wrapper.text()).toContain("明天整理任务系统"));
		const taskButton = wrapper
			.findAll("button")
			.find((button) => button.text() === "任务")!;
		await taskButton.trigger("click");

		expect(mockProcessFleetingToTask).toHaveBeenCalledWith("flash-1");
		expect(wrapper.text()).toContain("明天整理任务系统");
	});

	it("shows attachment input and pending state", async () => {
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(mockGetFleetingNotes).toHaveBeenCalled());
		const fileInput = wrapper.find('input[type="file"]');
		expect(fileInput.exists()).toBe(true);
		expect(fileInput.classes()).toContain("sr-only");
		expect(wrapper.text()).toContain("添加附件");
	});

	it("fixed process buttons are always enabled regardless of analysis status", async () => {
		mockGetFleetingNotes.mockResolvedValue({
			notes: [
				{ ...note, analysisStatus: "failed" as const, recommendationType: null },
			],
		});
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(wrapper.text()).toContain("明天整理任务系统"));
		// "按建议处理" should be disabled when not suggested
		const suggestionButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("按建议处理"))!;
		expect(suggestionButton.attributes("disabled")).toBeDefined();

		// Fixed buttons should always be enabled
		const journalButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("日记"))!;
		const clipButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("剪藏"))!;
		const deleteButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("删除"))!;
		expect(journalButton.attributes("disabled")).toBeUndefined();
		expect(clipButton.attributes("disabled")).toBeUndefined();
		expect(deleteButton.attributes("disabled")).toBeUndefined();
	});

	it("shows failed analysis state without alarming", async () => {
		mockGetFleetingNotes.mockResolvedValue({
			notes: [
				{ ...note, analysisStatus: "failed" as const, suggestion: "分析服务暂不可用" },
			],
		});
		const wrapper = mountInbox({ workspaceDir: "/workspace" });

		await vi.waitFor(() => expect(wrapper.text()).toContain("分析失败"));
		expect(wrapper.text()).toContain("分析失败");
	});
});
