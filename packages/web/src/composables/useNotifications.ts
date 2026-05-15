import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";

import {
	getNotifications,
	performNotificationAction,
	type NotificationEvent,
	type NotificationFilter,
	type NotificationsResponse,
} from "@/lib/api";

const emptyCounts: NotificationsResponse["counts"] = {
	unhandled: 0,
	all: 0,
	failed: 0,
	suggestions: 0,
	handled: 0,
};

export function useNotifications(workspaceDir?: () => string) {
	const notifications = ref<NotificationEvent[]>([]);
	const counts = ref<NotificationsResponse["counts"]>({ ...emptyCounts });
	const filter = ref<NotificationFilter>("unhandled");
	const isLoading = ref(false);
	const error = ref("");

	const load = async (nextFilter: NotificationFilter = filter.value) => {
		if (workspaceDir && !workspaceDir()) return;
		filter.value = nextFilter;
		isLoading.value = true;
		error.value = "";
		try {
			const response = await getNotifications(nextFilter);
			notifications.value = response.notifications;
			counts.value = response.counts;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			error.value = message;
			notifications.value = [];
			toast.error("加载通知失败", { description: message });
		} finally {
			isLoading.value = false;
		}
	};

	const runAction = async (eventId: string, actionId: string) => {
		try {
			await performNotificationAction(eventId, actionId);
			await load(filter.value);
			toast.success("通知已更新");
			return { success: true as const };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error("处理通知失败", { description: message });
			return { success: false as const, error: message };
		}
	};

	const unhandledCount = computed(() => counts.value.unhandled);

	if (workspaceDir) {
		watch(
			() => workspaceDir(),
			(dir) => {
				if (dir) void load(filter.value);
			},
			{ immediate: true },
		);
	} else {
		void load(filter.value);
	}

	return {
		notifications,
		counts,
		filter,
		isLoading,
		error,
		unhandledCount,
		load,
		runAction,
	};
}
