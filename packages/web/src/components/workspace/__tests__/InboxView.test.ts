import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
	createFleetingNote,
	getFleetingAttachments,
	getFleetingNotes,
	triggerFleetingAnalysis,
} from "@/lib/api";

import InboxView from "../InboxView.vue";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockGetFleetingAttachments = vi.mocked(getFleetingAttachments);
const mockTriggerFleetingAnalysis = vi.mocked(triggerFleetingAnalysis);

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

describe("InboxView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetFleetingNotes.mockResolvedValue({ notes: [note] });
		mockGetFleetingAttachments.mockResolvedValue({ attachments: [] });
		mockCreateFleetingNote.mockResolvedValue({ note });
		mockTriggerFleetingAnalysis.mockResolvedValue({ triggered: true, note });
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
			notes: [{ ...note, status: "processed" as const }],
		});
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		expect(wrapper.text()).toContain("已处理");
		expect(wrapper.find('button[aria-label="转为任务"]').exists()).toBe(false);
		expect(wrapper.find('button[aria-label="删除"]').exists()).toBe(false);
	});
});
