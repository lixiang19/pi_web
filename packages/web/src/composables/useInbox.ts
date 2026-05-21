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
	getFleetingNotes,
	uploadFleetingAttachments,
	getFleetingAttachments,
	triggerFleetingAnalysis,
	type FleetingAttachment,
	type FleetingNote,
} from "@/lib/api";

export type InboxItem = FleetingNote;
export type InboxSortKey = "modified" | "created" | "name";
export interface InboxActionOptions {
	successToast?: boolean;
}

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
	let eventSource: EventSource | null = null;

	const upsertNote = (note: FleetingNote) => {
		const index = inboxFiles.value.findIndex((item) => item.id === note.id);
		if (index >= 0) {
			inboxFiles.value = [
				...inboxFiles.value.slice(0, index),
				note,
				...inboxFiles.value.slice(index + 1),
			];
			return;
		}
		inboxFiles.value = [note, ...inboxFiles.value];
	};

	const load = async () => {
		if (!workspaceDir()) return;
		isLoading.value = true;
		error.value = "";
		try {
			const res = await getFleetingNotes();
			inboxFiles.value = res.notes;
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

	const captureNote = async (text: string, delayAnalysis?: boolean) => {
		if (!text.trim() || !workspaceDir()) return;
		const response = await createFleetingNote(text, delayAnalysis);
		toast.success("已保存闪念");
		window.dispatchEvent(new CustomEvent("ridge:fleeting-created"));
		await load();
		return response.note;
	};

	const uploadAttachments = async (
		noteId: string,
		files: File[],
		options: InboxActionOptions = {},
	) => {
		if (!files.length || !workspaceDir()) return;
		isUploadingAttachments.value = true;
		try {
			const res = await uploadFleetingAttachments(noteId, files);
			attachmentsMap.value = {
				...attachmentsMap.value,
				[noteId]: [...(attachmentsMap.value[noteId] || []), ...res.attachments],
			};
			if (options.successToast !== false) {
				toast.success(`已上传 ${files.length} 个附件`);
			}
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

	const retryAnalysis = async (id: string, options: InboxActionOptions = {}) => {
		try {
			const response = await triggerFleetingAnalysis(id);
			upsertNote(response.note);
			if (options.successToast !== false) {
				toast.success("已触发重新分析");
			}
		} catch (err) {
			toast.error("重新分析失败", {
				description: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};

	const getNoteAttachments = (noteId: string) => attachmentsMap.value[noteId] || [];

	const formatTime = (ts: number) => formatRelativeTime(ts);

	const closeEvents = () => {
		eventSource?.close();
		eventSource = null;
	};

	const connectEvents = () => {
		closeEvents();
		if (!workspaceDir()) return;
		eventSource = new EventSource("/api/fleeting/events");
		eventSource.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data) as {
					type?: string;
					note?: FleetingNote;
				};
				if (payload.type === "fleeting.note.updated" && payload.note) {
					upsertNote(payload.note);
				}
			} catch {
				// Ignore malformed event payloads from stale connections.
			}
		};
		eventSource.onerror = () => {
			closeEvents();
		};
	};

	watch(
		() => workspaceDir(),
		(dir) => {
			closeEvents();
			if (dir) {
				void load();
				connectEvents();
			}
		},
		{ immediate: true },
	);

	const handleExternalCreated = () => {
		void load();
	};

	window.addEventListener("ridge:fleeting-created", handleExternalCreated);
	onUnmounted(() => {
		closeEvents();
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
		retryAnalysis,
		getNoteAttachments,
		formatTime,
	};
}
