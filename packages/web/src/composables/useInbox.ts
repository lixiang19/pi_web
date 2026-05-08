import {
	type InjectionKey,
	computed,
	inject,
	onUnmounted,
	provide,
	ref,
	watch,
} from "vue";
import { toast } from "vue-sonner";

import {
	createFleetingNote,
	deleteFleetingNote,
	getFleetingNotes,
	processFleetingToClip,
	processFleetingToJournal,
	processFleetingToTask,
	type FleetingNote,
} from "@/lib/api";

export type InboxItem = FleetingNote;
export type InboxSortKey = "modified" | "created" | "name";

export const WORKSPACE_INBOX_KEY: InjectionKey<ReturnType<typeof useInboxInner>> =
	Symbol("workspace-inbox");

export function provideWorkspaceInbox(workspaceDir: () => string) {
	const store = useInboxInner(workspaceDir);
	provide(WORKSPACE_INBOX_KEY, store);
	return store;
}

export function useWorkspaceInbox(workspaceDir?: () => string) {
	const injected = inject(WORKSPACE_INBOX_KEY, undefined);
	if (injected) return injected;
	return useInboxInner(workspaceDir!);
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	if (hours < 24) return `${hours} 小时前`;
	if (days < 7) return `${days} 天前`;

	return new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp);
}

function useInboxInner(workspaceDir: () => string) {
	const inboxFiles = ref<InboxItem[]>([]);
	const isLoading = ref(false);
	const error = ref("");
	const searchQuery = ref("");
	const sortKey = ref<InboxSortKey>("modified");

	const load = async () => {
		if (!workspaceDir()) return;
		isLoading.value = true;
		error.value = "";
		try {
			const res = await getFleetingNotes();
			inboxFiles.value = res.notes;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			inboxFiles.value = [];
		} finally {
			isLoading.value = false;
		}
	};

	const filteredFiles = computed(() => {
		let list = inboxFiles.value;
		const q = searchQuery.value.trim().toLowerCase();
		if (q) {
			list = list.filter((item) => {
				const recommendation = item.recommendationText ?? "";
				return (
					item.content.toLowerCase().includes(q) ||
					recommendation.toLowerCase().includes(q)
				);
			});
		}

		const sorted = [...list];
		switch (sortKey.value) {
			case "modified":
				sorted.sort((a, b) => b.updatedAt - a.updatedAt);
				break;
			case "created":
				sorted.sort((a, b) => b.createdAt - a.createdAt);
				break;
			case "name":
				sorted.sort((a, b) => a.content.localeCompare(b.content, "zh-CN"));
				break;
		}
		return sorted;
	});

	const recentItems = computed(() =>
		[...inboxFiles.value].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3),
	);
	const count = computed(() => inboxFiles.value.length);
	const analyzingCount = computed(
		() => inboxFiles.value.filter((item) => item.analysisStatus === "analyzing").length,
	);
	const hasPendingAnalysis = computed(() =>
		inboxFiles.value.some((item) => item.analysisStatus !== "suggested"),
	);

	const captureNote = async (text: string) => {
		if (!text.trim() || !workspaceDir()) return;
		const response = await createFleetingNote(text);
		toast.success("已保存闪念");
		window.dispatchEvent(new CustomEvent("ridge:fleeting-created"));
		await load();
		return response.note;
	};

	const deleteItem = async (id: string) => {
		const prev = [...inboxFiles.value];
		inboxFiles.value = inboxFiles.value.filter((item) => item.id !== id);
		try {
			await deleteFleetingNote(id);
			toast.success("闪念已删除");
		} catch (err) {
			inboxFiles.value = prev;
			toast.error("删除失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};

	const processToJournal = async (id: string, content: string) => {
		await processFleetingToJournal(id, content);
		inboxFiles.value = inboxFiles.value.filter((item) => item.id !== id);
		toast.success("已写入今日日记");
	};

	const processToClip = async (
		id: string,
		data: { title: string; url?: string; content: string; source?: string },
	) => {
		await processFleetingToClip(id, data);
		inboxFiles.value = inboxFiles.value.filter((item) => item.id !== id);
		toast.success("已保存为剪藏");
	};

	const processToTask = async (id: string) => {
		const res = await processFleetingToTask(id);
		toast.info(res.message);
	};

	const formatTime = (ts: number) => formatRelativeTime(ts);

	watch(
		() => workspaceDir(),
		(dir) => {
			if (dir) load();
		},
		{ immediate: true },
	);

	let pollTimer: number | null = null;
	const stopPolling = () => {
		if (pollTimer) {
			window.clearInterval(pollTimer);
			pollTimer = null;
		}
	};

	watch(
		hasPendingAnalysis,
		(shouldPoll) => {
			stopPolling();
			if (shouldPoll) {
				pollTimer = window.setInterval(() => {
					void load();
				}, 3000);
			}
		},
		{ immediate: true },
	);

	const handleExternalCreated = () => {
		void load();
	};

	window.addEventListener("ridge:fleeting-created", handleExternalCreated);
	onUnmounted(() => {
		stopPolling();
		window.removeEventListener("ridge:fleeting-created", handleExternalCreated);
	});

	return {
		inboxFiles,
		filteredFiles,
		recentItems,
		isLoading,
		error,
		searchQuery,
		sortKey,
		count,
		analyzingCount,
		load,
		captureNote,
		deleteItem,
		processToJournal,
		processToClip,
		processToTask,
		formatTime,
	};
}
