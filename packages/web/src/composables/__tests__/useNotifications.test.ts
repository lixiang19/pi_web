import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

import { useNotifications } from "@/composables/useNotifications";
import {
	getNotifications,
	performNotificationAction,
	type NotificationEvent,
	type NotificationsResponse,
} from "@/lib/api";
import { toast } from "vue-sonner";

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

const baseNotification = (override: Partial<NotificationEvent> = {}): NotificationEvent => ({
	id: "notification-1",
	eventType: "file_processing.convert_failed",
	type: "failure",
	source: "file_processing",
	severity: "error",
	status: "unread",
	title: "文件转换失败",
	body: "convert failed",
	payload: { filePath: "/workspace/draft.pdf" },
	related: { type: "file", id: "/workspace/draft.pdf" },
	actions: [{ id: "retry", label: "重试", kind: "retry" }],
	createdAt: 1000,
	updatedAt: 1000,
	handledAt: null,
	...override,
});

const response = (override: Partial<NotificationsResponse> = {}): NotificationsResponse => ({
	notifications: [baseNotification()],
	counts: {
		unhandled: 1,
		all: 1,
		failed: 1,
		suggestions: 0,
		handled: 0,
	},
	...override,
});

const runScopedNotifications = (workspaceDir?: () => string) => {
	const scope = effectScope();
	const composable = scope.run(() => useNotifications(workspaceDir));
	if (!composable) throw new Error("useNotifications did not initialize");
	return { scope, composable };
};

describe("useNotifications", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getNotifications).mockResolvedValue(response());
		vi.mocked(performNotificationAction).mockResolvedValue({
			notification: baseNotification({ status: "handled", handledAt: 2000 }),
		});
	});

	it("loads unhandled notifications immediately when workspace is available", async () => {
		const { scope, composable } = runScopedNotifications(() => "/workspace");

		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledWith("unhandled"));

		expect(composable.notifications.value).toEqual([baseNotification()]);
		expect(composable.counts.value.unhandled).toBe(1);
		expect(composable.unhandledCount.value).toBe(1);
		expect(composable.filter.value).toBe("unhandled");
		expect(composable.error.value).toBe("");
		scope.stop();
	});

	it("does not request notifications until a workspace directory exists", async () => {
		const workspaceDir = ref("");
		const { scope } = runScopedNotifications(() => workspaceDir.value);

		await nextTick();
		expect(getNotifications).not.toHaveBeenCalled();

		workspaceDir.value = "/workspace";
		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledWith("unhandled"));
		scope.stop();
	});

	it("switches filters and stores the latest response", async () => {
		const { scope, composable } = runScopedNotifications(() => "/workspace");
		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledWith("unhandled"));
		vi.mocked(getNotifications).mockResolvedValueOnce(response({
			notifications: [baseNotification({ id: "notification-handled", status: "handled" })],
			counts: { unhandled: 0, all: 1, failed: 0, suggestions: 0, handled: 1 },
		}));

		await composable.load("handled");

		expect(getNotifications).toHaveBeenLastCalledWith("handled");
		expect(composable.filter.value).toBe("handled");
		expect(composable.notifications.value[0]?.id).toBe("notification-handled");
		expect(composable.counts.value.handled).toBe(1);
		scope.stop();
	});

	it("runs an action, reloads the current filter, and shows success", async () => {
		const { scope, composable } = runScopedNotifications(() => "/workspace");
		await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledWith("unhandled"));

		const result = await composable.runAction("notification-1", "retry");

		expect(result).toEqual({ success: true });
		expect(performNotificationAction).toHaveBeenCalledWith("notification-1", "retry");
		expect(getNotifications).toHaveBeenLastCalledWith("unhandled");
		expect(toast.success).toHaveBeenCalledWith("通知已更新");
		scope.stop();
	});

	it("keeps current state and reports action errors", async () => {
		vi.mocked(performNotificationAction).mockRejectedValueOnce(new Error("retry failed"));
		const { scope, composable } = runScopedNotifications(() => "/workspace");
		await vi.waitFor(() => expect(composable.notifications.value).toHaveLength(1));

		const result = await composable.runAction("notification-1", "retry");

		expect(result).toEqual({ success: false, error: "retry failed" });
		expect(composable.notifications.value).toHaveLength(1);
		expect(toast.error).toHaveBeenCalledWith("处理通知失败", { description: "retry failed" });
		scope.stop();
	});

	it("clears notifications and stores load errors", async () => {
		vi.mocked(getNotifications).mockRejectedValueOnce(new Error("load failed"));
		const { scope, composable } = runScopedNotifications(() => "/workspace");

		await vi.waitFor(() => expect(composable.error.value).toBe("load failed"));

		expect(composable.notifications.value).toEqual([]);
		expect(toast.error).toHaveBeenCalledWith("加载通知失败", { description: "load failed" });
		scope.stop();
	});
});
