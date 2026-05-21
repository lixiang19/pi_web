import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "vue-sonner";

vi.mock("vue-sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock("@/components/ui/dialog", () => ({
	Dialog: { template: "<div v-if='open'><slot /></div>", props: ["open"] },
	DialogContent: { template: "<div><slot /></div>" },
	DialogDescription: { template: "<span><slot /></span>" },
	DialogFooter: { template: "<div><slot /></div>" },
	DialogHeader: { template: "<div><slot /></div>" },
	DialogTitle: { template: "<div><slot /></div>" },
}));

vi.mock("@/components/ui/tooltip", () => ({
	TooltipProvider: { template: "<div><slot /></div>" },
	Tooltip: { template: "<div><slot /></div>" },
	TooltipTrigger: { template: "<div><slot /></div>" },
	TooltipContent: { template: "<div><slot /></div>" },
}));

vi.mock("@/lib/api", () => ({
	getFleetingNotes: vi.fn(),
	createFleetingNote: vi.fn(),
	uploadFleetingAttachments: vi.fn(),
	getFleetingAttachments: vi.fn(),
	triggerFleetingAnalysis: vi.fn(),
	getProjects: vi.fn(() =>
		Promise.resolve({
			projects: [
				{ id: "proj-1", name: "Aurora", path: "/a", updatedAt: Date.now() },
			],
		}),
	),
	captureFromDesktop: vi.fn(),
	getAuthSession: vi.fn(() => Promise.resolve({ authenticated: true })),
}));

import {
	captureFromDesktop,
	createFleetingNote,
	getFleetingAttachments,
	getFleetingNotes,
	triggerFleetingAnalysis,
	uploadFleetingAttachments,
} from "@/lib/api";

import InboxView from "../InboxView.vue";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockGetFleetingAttachments = vi.mocked(getFleetingAttachments);
const mockTriggerFleetingAnalysis = vi.mocked(triggerFleetingAnalysis);
const mockUploadFleetingAttachments = vi.mocked(uploadFleetingAttachments);
const mockCaptureFromDesktop = vi.mocked(captureFromDesktop);
const mockToastSuccess = vi.mocked(toast.success);

const note = {
	id: "flash-1",
	content: "明天整理任务系统",
	status: "pending" as const,
	analysisStatus: "suggested" as const,
	recommendationType: "task" as const,
	recommendationText: "建议转为任务",
	draft: "明天整理任务系统",
	requiresInput: false,
	lastError: null,
	retryCount: 0,
	piSessionId: null,
	piSessionFile: null,
	createdAt: Date.now(),
	updatedAt: Date.now(),
};

const capturedNote = {
	...note,
	captureType: "file",
	metadata: {},
};

describe("InboxView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetFleetingNotes.mockResolvedValue({ notes: [note] });
		mockGetFleetingAttachments.mockResolvedValue({ attachments: [] });
		mockCreateFleetingNote.mockResolvedValue({ note });
		mockTriggerFleetingAnalysis.mockResolvedValue({ triggered: true, note });
		mockUploadFleetingAttachments.mockResolvedValue({ attachments: [] });
		mockCaptureFromDesktop.mockResolvedValue({ note: capturedNote, attachments: [] });
	});

	it("renders fleeting notes without manual suggestion or processing actions", async () => {
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		expect(wrapper.text()).toContain("明天整理任务系统");
		expect(wrapper.text()).not.toContain("按建议");
		expect(wrapper.text()).not.toContain("建议转为任务");
		expect(wrapper.find('button[aria-label="转为日记"]').exists()).toBe(false);
		expect(wrapper.find('button[aria-label="转为任务"]').exists()).toBe(false);
		expect(wrapper.find('button[aria-label="转为里程碑"]').exists()).toBe(false);
		expect(wrapper.find('button[aria-label="保存剪藏"]').exists()).toBe(false);
		expect(wrapper.find('button[aria-label="查看附件"]').exists()).toBe(false);
		expect(wrapper.find('button[aria-label="删除"]').exists()).toBe(false);
	});

	it("keeps retry analysis visible for failed notes", async () => {
		mockGetFleetingNotes.mockResolvedValue({
			notes: [
				{
					...note,
					analysisStatus: "failed" as const,
					lastError: "model unavailable",
				},
			],
		});
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		const retryButton = wrapper.find('button[aria-label="重试分析"]');
		expect(retryButton.exists()).toBe(true);

		await retryButton.trigger("click");
		await flushPromises();
		expect(mockTriggerFleetingAnalysis).toHaveBeenCalledWith(note.id);
	});

	it("renders processed notes without manual actions", async () => {
		mockGetFleetingNotes.mockResolvedValue({
			notes: [
				{
					...note,
					status: "processed" as const,
					analysisStatus: "processed" as const,
					recommendationText: "已整理为任务：明天检查任务系统主流程。",
				},
			],
		});
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		expect(wrapper.text()).toContain("已处理");
		expect(wrapper.find('button[aria-label="转为任务"]').exists()).toBe(false);
		expect(wrapper.find('button[aria-label="删除"]').exists()).toBe(false);
	});

	it("shows processed analysis details when expanded and can collapse again", async () => {
		mockGetFleetingNotes.mockResolvedValue({
			notes: [
				{
					...note,
					status: "processed" as const,
					analysisStatus: "processed" as const,
					content: "明天整理任务系统\n顺手检查规划工具权限。",
					recommendationText: "已沉淀为任务：整理任务系统，并补齐权限检查。",
					draft: null,
				},
			],
		});
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		expect(wrapper.text()).not.toContain("已沉淀为任务");

		await wrapper.get('[data-testid="fleeting-note-collapsed"]').trigger("click");
		await flushPromises();

		expect(wrapper.text()).toContain("处理结果");
		expect(wrapper.text()).toContain("已沉淀为任务：整理任务系统，并补齐权限检查。");

		await wrapper.get('button[aria-label="收起闪念详情"]').trigger("click");
		await flushPromises();

		expect(wrapper.text()).not.toContain("处理结果");
		expect(wrapper.text()).not.toContain("已沉淀为任务：整理任务系统，并补齐权限检查。");
		expect(wrapper.get('[data-testid="fleeting-note-collapsed"]').text()).toContain("明天整理任务系统");
	});

	it("shows one success toast when saving a fleeting note with attachments", async () => {
		mockCaptureFromDesktop.mockResolvedValue({
			note: { ...capturedNote, id: "flash-upload", content: "附件闪念" },
			attachments: [],
		});
		mockTriggerFleetingAnalysis.mockResolvedValue({
			triggered: true,
			note: { ...note, id: "flash-upload", analysisStatus: "unanalyzed" },
		});
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		const file = new File(["hello"], "note.txt", { type: "text/plain" });
		const input = wrapper.get('input[type="file"]');
		Object.defineProperty(input.element, "files", {
			configurable: true,
			value: [file],
		});
		await input.trigger("change");
		await wrapper.get("textarea").setValue("附件闪念");

		const sendButton = wrapper.findAll("button").find((button) => button.text().includes("发送"));
		expect(sendButton).toBeTruthy();
		await sendButton!.trigger("click");
		await flushPromises();

		expect(mockUploadFleetingAttachments).toHaveBeenCalledWith("flash-upload", [file]);
		expect(mockTriggerFleetingAnalysis).toHaveBeenCalledWith("flash-upload");
		expect(mockToastSuccess).toHaveBeenCalledTimes(1);
		expect(mockToastSuccess).toHaveBeenCalledWith("已保存闪念，1 个附件已进入分析");
	});
});
