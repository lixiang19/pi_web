import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";

import NotificationCenterView from "../NotificationCenterView.vue";
import {
	getNotifications,
	performNotificationAction,
	type NotificationEvent,
} from "@/lib/api";

vi.mock("@/lib/api", () => ({
	getNotifications: vi.fn(),
	performNotificationAction: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

const TabsStub = defineComponent({
	props: ["modelValue"],
	emits: ["update:modelValue"],
	template: `<div><slot /></div>`,
});

const TabsTriggerStub = defineComponent({
	props: ["value"],
	emits: ["click"],
	template: `<button type="button" @click="$emit('click')"><slot /></button>`,
});

const globalStubs = {
	Badge: { template: "<span><slot /></span>" },
	Button: { template: "<button v-bind='$attrs'><slot /></button>" },
	ScrollArea: { template: "<div><slot /></div>" },
	Tabs: TabsStub,
	TabsList: { template: "<div><slot /></div>" },
	TabsTrigger: TabsTriggerStub,
	AlertCircle: true,
	Bell: true,
	CheckCircle2: true,
	CircleSlash2: true,
	ExternalLink: true,
	Info: true,
	LoaderCircle: true,
	RefreshCcw: true,
	Sparkles: true,
	TriangleAlert: true,
};

const notification = (override: Partial<NotificationEvent> = {}): NotificationEvent => ({
	id: "notification-1",
	eventType: "file_processing.convert_failed",
	type: "failure",
	source: "file_processing",
	severity: "error",
	status: "unread",
	title: "文件转换失败: draft.pdf",
	body: "converter crashed",
	payload: { filePath: "/workspace/附件/draft.pdf" },
	related: { type: "file", id: "/workspace/附件/draft.pdf" },
	actions: [
		{ id: "retry", label: "重试", kind: "retry" },
		{ id: "open_related", label: "打开对象", kind: "open_related" },
		{ id: "dismiss", label: "忽略", kind: "dismiss" },
	],
	createdAt: 2000,
	updatedAt: 2000,
	handledAt: null,
	...override,
});

describe("NotificationCenterView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getNotifications).mockResolvedValue({
			notifications: [notification()],
			counts: {
				unhandled: 1,
				all: 1,
				failed: 1,
				suggestions: 0,
				handled: 0,
			},
		});
		vi.mocked(performNotificationAction).mockResolvedValue({
			notification: notification({ status: "handled", handledAt: 3000 }),
		});
	});

	it("renders counts, notification details and runs retry actions", async () => {
		const wrapper = mount(NotificationCenterView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledWith("unhandled"));
		expect(wrapper.text()).toContain("未处理");
		expect(wrapper.text()).toContain("文件转换失败: draft.pdf");
		expect(wrapper.text()).toContain("converter crashed");

		await wrapper.findAll("button").find((button) => button.text().includes("重试"))!.trigger("click");
		await nextTick();

		expect(performNotificationAction).toHaveBeenCalledWith("notification-1", "retry");
		expect(getNotifications).toHaveBeenCalledTimes(2);
	});

	it("disables a running action to avoid duplicate submissions", async () => {
		let resolveAction!: (value: Awaited<ReturnType<typeof performNotificationAction>>) => void;
		vi.mocked(performNotificationAction).mockImplementationOnce(
			() => new Promise((resolve) => {
				resolveAction = resolve;
			}),
		);
		const wrapper = mount(NotificationCenterView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await vi.waitFor(() => expect(wrapper.text()).toContain("重试"));
		const retryButton = wrapper.findAll("button").find((button) => button.text().includes("重试"))!;
		const firstClick = retryButton.trigger("click");
		await nextTick();
		await retryButton.trigger("click");

		expect(performNotificationAction).toHaveBeenCalledTimes(1);
		expect((retryButton.element as HTMLButtonElement).disabled).toBe(true);

		resolveAction({ notification: notification({ status: "handled", handledAt: 3000 }) });
		await firstClick;
		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(2));
	});

	it("emits open-file from the related object action", async () => {
		const wrapper = mount(NotificationCenterView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await vi.waitFor(() => expect(wrapper.text()).toContain("打开对象"));
		await wrapper.findAll("button").find((button) => button.text().includes("打开对象"))!.trigger("click");

		expect(wrapper.emitted("openFile")?.[0]).toEqual(["/workspace/附件/draft.pdf"]);
		expect(performNotificationAction).not.toHaveBeenCalled();
	});

	it("navigates project and automation related objects and omits unsupported background links", async () => {
		vi.mocked(getNotifications).mockResolvedValueOnce({
			notifications: [
				notification({
					id: "notification-project",
					title: "项目提醒",
					related: { type: "project", id: "project-1" },
					actions: [{ id: "open_related", label: "打开对象", kind: "open_related" }],
				}),
				notification({
					id: "notification-automation",
					title: "自动化提醒",
					related: { type: "automation", id: "automation-1" },
					actions: [{ id: "open_related", label: "打开对象", kind: "open_related" }],
				}),
				notification({
					id: "notification-background",
					title: "后台任务失败",
					related: { type: "background_job", id: "job-1" },
					actions: [],
				}),
			],
			counts: {
				unhandled: 3,
				all: 3,
				failed: 3,
				suggestions: 0,
				handled: 0,
			},
		});
		const wrapper = mount(NotificationCenterView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await vi.waitFor(() => expect(wrapper.text()).toContain("后台任务失败"));
		const openButtons = wrapper.findAll("button").filter((button) => button.text().includes("打开对象"));
		expect(openButtons).toHaveLength(2);

		await openButtons[0]!.trigger("click");
		await openButtons[1]!.trigger("click");

		expect(wrapper.emitted("openProject")?.[0]).toEqual(["project-1"]);
		expect(wrapper.emitted("openAutomation")?.[0]).toEqual([]);
		expect(performNotificationAction).not.toHaveBeenCalled();
	});

	it("switches filters through the tab controls", async () => {
		const wrapper = mount(NotificationCenterView, {
			props: { workspaceDir: "/workspace" },
			global: { stubs: globalStubs },
		});

		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledWith("unhandled"));
		await wrapper.findAll("button").find((button) => button.text().includes("失败"))!.trigger("click");

		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledWith("failed"));
	});
});
