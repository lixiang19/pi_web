import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Test-friendly stubs for shadcn Select (rendered as native <select>)
const SelectStub = defineComponent({
  props: { modelValue: { type: [String, Number, null], default: null } },
  emits: ["update:modelValue"],
  setup(props, { emit, slots }) {
    return () =>
      h("select", {
        value: props.modelValue ?? "",
        onChange: (e: Event) => {
          const val = (e.target as HTMLSelectElement).value;
          emit("update:modelValue", val === "" ? null : val);
        },
        "data-testid": "native-select",
      },
      slots["default"]?.());
  },
});
const SelectContentStub = defineComponent({
  setup(_, { slots }) {
    return () => slots["default"]?.();
  },
});
const SelectItemStub = defineComponent({
  props: { value: { type: [String, Number, null], default: null } },
  setup(props, { slots }) {
    return () => h("option", { value: props.value ?? "" }, slots["default"]?.());
  },
});
const SelectTriggerStub = defineComponent({ setup() { return () => null; } });
const SelectValueStub = defineComponent({ setup() { return () => null; } });

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
	getProjects: vi.fn(() =>
		Promise.resolve({
			projects: [
				{ id: "proj-1", name: "Aurora", path: "/a", updatedAt: Date.now() },
				{ id: "proj-2", name: "openchamber", path: "/b", updatedAt: Date.now() },
			],
		}),
	),
}));

import {
	createFleetingNote,
	getFleetingNotes,
	getFleetingAttachments,
	processFleetingToTask,
	processFleetingToMilestone,
} from "@/lib/api";

import InboxView from "../InboxView.vue";

const mockGetFleetingNotes = vi.mocked(getFleetingNotes);
const mockCreateFleetingNote = vi.mocked(createFleetingNote);
const mockGetFleetingAttachments = vi.mocked(getFleetingAttachments);
const mockProcessFleetingToTask = vi.mocked(processFleetingToTask);
const mockProcessFleetingToMilestone = vi.mocked(processFleetingToMilestone);

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
		mockProcessFleetingToTask.mockResolvedValue({
			deleted: true,
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
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});
		mockProcessFleetingToMilestone.mockResolvedValue({
			deleted: true,
			milestone: {
				id: "ms-1",
				workspacePath: "/workspace",
				projectId: null,
				title: "Q2 里程碑",
				goal: "完成核心功能",
				acceptanceCriteria: "通过验收",
				status: "pending",
				dueDate: null,
				isSystem: false,
				color: "#64748b",
				sortOrder: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				taskCount: 0,
			},
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
		expect(wrapper.text()).toContain("里程碑");
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

		expect(mockCreateFleetingNote).toHaveBeenCalledWith("新的闪念", false);
		expect(wrapper.emitted("open-file")).toBeUndefined();
	});

	it("opens task dialog but doesn't remove note from queue immediately", async () => {
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
		});

		await flushPromises();
		expect(wrapper.text()).toContain("明天整理任务系统");
		// Clicking task button opens dialog, doesn't immediately process
		const taskButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("任务"))!;
		await taskButton.trigger("click");

		// Should still show the note because dialog is open, not processed yet
		expect(wrapper.text()).toContain("明天整理任务系统");
	});

	it("submits task with selected projectId through DOM interaction", async () => {
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
			global: {
				stubs: {
					Select: SelectStub,
					SelectContent: SelectContentStub,
					SelectItem: SelectItemStub,
					SelectTrigger: SelectTriggerStub,
					SelectValue: SelectValueStub,
				},
			},
		});

		await flushPromises();

		const taskButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("任务"))!;
		await taskButton.trigger("click");
		await flushPromises();

		// Fill task title
		const inputs = wrapper.findAll("input");
		const titleInput = inputs.find(
			(input) => input.attributes("placeholder") === "任务标题",
		);
		expect(titleInput).toBeTruthy();
		await titleInput!.setValue("带项目的任务");

		// Fill acceptance criteria
		const textareas = wrapper.findAll("textarea");
		const acceptanceTextarea = textareas.find(
			(t) => t.attributes("placeholder") === "完成标准 / 验收标准",
		);
		expect(acceptanceTextarea).toBeTruthy();
		await acceptanceTextarea!.setValue("完成验收");

		// Select project via native select
		const selects = wrapper.findAll("[data-testid='native-select']");
		expect(selects.length).toBeGreaterThanOrEqual(3);
		const projectSelect = selects[2];
		expect(projectSelect).toBeTruthy();
		const selEl = projectSelect!.element as HTMLSelectElement;
		selEl.value = "proj-1";
		selEl.dispatchEvent(new Event("change", { bubbles: true }));
		await flushPromises();

		const confirmButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("创建任务"))!;
		await confirmButton.trigger("click");
		await flushPromises();

		expect(mockProcessFleetingToTask).toHaveBeenCalledWith(note.id, {
			title: "带项目的任务",
			priority: "normal",
			acceptanceCriteria: "完成验收",
			projectId: "proj-1",
		});
	});

	it("submits milestone with selected projectId through DOM interaction", async () => {
		const wrapper = mount(InboxView, {
			props: { workspaceDir: "/workspace" },
			global: {
				stubs: {
					Select: SelectStub,
					SelectContent: SelectContentStub,
					SelectItem: SelectItemStub,
					SelectTrigger: SelectTriggerStub,
					SelectValue: SelectValueStub,
				},
			},
		});

		await flushPromises();

		// Open milestone dialog
		const msButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("里程碑"))!;
		await msButton.trigger("click");
		await flushPromises();

		// Fill milestone title
		const inputs = wrapper.findAll("input");
		const titleInput = inputs.find(
			(input) => input.attributes("placeholder") === "里程碑标题",
		);
		expect(titleInput).toBeTruthy();
		await titleInput!.setValue("带项目的里程碑");

		// Fill goal and acceptance via textareas
		const textareas = wrapper.findAll("textarea");
		const goalTextarea = textareas.find((t) => t.attributes("placeholder") === "目标");
		expect(goalTextarea).toBeTruthy();
		await goalTextarea!.setValue("达成目标");

		const acceptanceTextarea = textareas.find(
			(t) => t.attributes("placeholder") === "完成标准 / 验收标准",
		);
		expect(acceptanceTextarea).toBeTruthy();
		await acceptanceTextarea!.setValue("通过验收");

		// Interact with project select via DOM
		const selects = wrapper.findAll("select");
		expect(selects.length).toBeGreaterThanOrEqual(2);
		const projectSelect = selects[1];
		expect(projectSelect).toBeTruthy();
		await projectSelect!.setValue("proj-2");
		await flushPromises();

		// Submit form
		const confirmButton = wrapper
			.findAll("button")
			.find((button) => button.text().includes("创建里程碑"))!;
		await confirmButton.trigger("click");
		await flushPromises();

		expect(mockProcessFleetingToMilestone).toHaveBeenCalledWith(note.id, {
			title: "带项目的里程碑",
			goal: "达成目标",
			acceptanceCriteria: "通过验收",
			projectId: "proj-2",
		});
	});
});
