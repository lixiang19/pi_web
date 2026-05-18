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
	processFleetingToMilestone,
	processFleetingToAttachment,
	uploadFleetingAttachments,
	getFleetingAttachments,
	triggerFleetingAnalysis,
	type FleetingAttachment,
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
	const attachmentsMap = ref<Record<string, FleetingAttachment[]>>({});
	const isUploadingAttachments = ref(false);

	const load = async () => {
		if (!workspaceDir()) return;
		isLoading.value = true;
		error.value = "";
		try {
			const res = await getFleetingNotes();
			inboxFiles.value = res.notes;
			// Load attachments for all notes
			const newMap: Record<string, FleetingAttachment[]> = {};
			await Promise.all(
				res.notes.map(async (note) => {
					try {
						const attRes = await getFleetingAttachments(note.id);
						newMap[note.id] = attRes.attachments;
					} catch {
						newMap[note.id] = [];
					}
				}),
			);
			attachmentsMap.value = newMap;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			inboxFiles.value = [];
			attachmentsMap.value = {};
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
	const analyzingCount = computed(
		() => inboxFiles.value.filter((item) => item.analysisStatus === "analyzing").length,
	);
	const processedCount = computed(
		() => inboxFiles.value.filter((item) => item.status === "processed").length,
	);
	const totalCount = computed(() => inboxFiles.value.length);
	const pendingCount = computed(
		() => inboxFiles.value.filter((item) => item.status !== "processed").length,
	);
	const count = pendingCount;
	const hasPendingAnalysis = computed(() =>
		inboxFiles.value.some(
			(item) => item.analysisStatus === "unanalyzed" || item.analysisStatus === "analyzing",
		),
	);

	const captureNote = async (text: string, delayAnalysis?: boolean) => {
		if (!text.trim() || !workspaceDir()) return;
		const response = await createFleetingNote(text, delayAnalysis);
		toast.success("已保存闪念");
		window.dispatchEvent(new CustomEvent("ridge:fleeting-created"));
		await load();
		return response.note;
	};

	const uploadAttachments = async (noteId: string, files: File[]) => {
		if (!files.length || !workspaceDir()) return;
		isUploadingAttachments.value = true;
		try {
			const res = await uploadFleetingAttachments(noteId, files);
			attachmentsMap.value = {
				...attachmentsMap.value,
				[noteId]: [...(attachmentsMap.value[noteId] || []), ...res.attachments],
			};
			toast.success(`已上传 ${files.length} 个附件`);
			return res.attachments;
		} catch (err) {
			toast.error("上传附件失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			throw err;
		} finally {
			isUploadingAttachments.value = false;
		}
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

	const markProcessed = (id: string, note: FleetingNote) => {
		inboxFiles.value = inboxFiles.value.map((item) => (item.id === id ? note : item));
		const newMap = { ...attachmentsMap.value };
		delete newMap[id];
		attachmentsMap.value = newMap;
	};

	const processToJournal = async (id: string, content: string) => {
		const res = await processFleetingToJournal(id, content);
		markProcessed(id, res.note);
		toast.success("已写入今日日记");
		if (res.migratedAttachments?.length) {
			toast.info(`已迁移 ${res.migratedAttachments.length} 个附件到正式目录`);
		}
	};

	const processToClip = async (
		id: string,
		data: { title: string; url?: string; content: string; source?: string },
	) => {
		const res = await processFleetingToClip(id, data);
		markProcessed(id, res.note);
		toast.success("已保存为剪藏");
		if (res.migratedAttachments?.length) {
			toast.info(`已迁移 ${res.migratedAttachments.length} 个附件到正式目录`);
		}
	};

	const processToTask = async (id: string, data: { title: string; priority: "normal" | "important" | "urgent"; acceptanceCriteria: string; dueDate?: number | null; projectId?: string | null }) => {
		const res = await processFleetingToTask(id, data);
		markProcessed(id, res.note);
		toast.success("已创建任务");
		if (res.migratedAttachments?.length) {
			toast.info(`已迁移 ${res.migratedAttachments.length} 个附件到正式目录`);
		}
	};

	const processToMilestone = async (id: string, data: { title: string; goal: string; acceptanceCriteria: string; dueDate?: number | null; color?: string; projectId?: string | null }) => {
		const res = await processFleetingToMilestone(id, data);
		markProcessed(id, res.note);
		toast.success("已创建里程碑");
		if (res.migratedAttachments?.length) {
			toast.info(`已迁移 ${res.migratedAttachments.length} 个附件到正式目录`);
		}
	};

	const processToAttachment = async (id: string) => {
		const res = await processFleetingToAttachment(id);
		markProcessed(id, res.note);
		toast.success("已保存为正式附件");
		if (res.migratedAttachments?.length) {
			toast.info(`已迁移 ${res.migratedAttachments.length} 个附件到正式目录`);
		}
	};

	const retryAnalysis = async (id: string) => {
		try {
			await triggerFleetingAnalysis(id);
			toast.success("已触发重新分析");
			await load();
		} catch (err) {
			toast.error("重新分析失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};

	const getNoteAttachments = (noteId: string) => attachmentsMap.value[noteId] || [];

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
		totalCount,
		processedCount,
		pendingCount,
		analyzingCount,
		isUploadingAttachments,
		load,
		captureNote,
		uploadAttachments,
		deleteItem,
		processToJournal,
		processToClip,
		processToTask,
		processToMilestone,
		processToAttachment,
		retryAnalysis,
		getNoteAttachments,
		formatTime,
	};
}
