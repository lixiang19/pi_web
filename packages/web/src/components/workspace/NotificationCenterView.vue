<script setup lang="ts">
import { computed, ref } from "vue";
import {
	AlertCircle,
	Bell,
	CheckCircle2,
	CircleSlash2,
	ExternalLink,
	Info,
	LoaderCircle,
	RefreshCcw,
	Sparkles,
	TriangleAlert,
} from "lucide-vue-next";

import { useNotifications } from "@/composables/useNotifications";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
	NotificationAction,
	NotificationEvent,
	NotificationFilter,
	NotificationType,
} from "@/lib/api";

const props = defineProps<{ workspaceDir: string }>();

const emit = defineEmits<{
	openFile: [path: string];
	openSession: [sessionId: string];
	openProject: [projectId: string];
	openAutomation: [];
	openTasks: [];
	notificationsUpdated: [];
}>();

const {
	notifications,
	counts,
	filter,
	isLoading,
	error,
	load,
	runAction,
} = useNotifications(() => props.workspaceDir);

const pendingActionKeys = ref(new Set<string>());

const filterOptions: Array<{ id: NotificationFilter; label: string }> = [
	{ id: "unhandled", label: "未处理" },
	{ id: "all", label: "全部" },
	{ id: "failed", label: "失败" },
	{ id: "suggestions", label: "建议" },
	{ id: "handled", label: "已处理" },
];

const typeLabels: Record<NotificationType, string> = {
	suggestion: "建议",
	confirmation: "待确认",
	failure: "失败",
	warning: "警告",
	info: "信息",
};

const statusLabels: Record<string, string> = {
	unread: "未读",
	pending: "待处理",
	handled: "已处理",
	dismissed: "已忽略",
	failed: "处理失败",
};

const typeIconMap = {
	suggestion: Sparkles,
	confirmation: Bell,
	failure: AlertCircle,
	warning: TriangleAlert,
	info: Info,
} as const;

const actionableCount = computed(() => counts.value.unhandled);

const formatTime = (timestamp: number) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp);

const sourceLabel = (source: string) => {
	const labels: Record<string, string> = {
		file_processing: "文件处理",
		rag: "RAG",
		background_jobs: "后台任务",
		task_review: "任务回顾",
		automation: "自动化",
		fleeting: "闪念",
	};
	return labels[source] ?? source;
};

const relatedLabel = (notification: NotificationEvent) => {
	if (!notification.related) return "";
	const labels: Record<string, string> = {
		file: "文件",
		task: "任务",
		milestone: "里程碑",
		session: "会话",
		project: "项目",
		automation: "自动化",
		background_job: "后台任务",
	};
	return `${labels[notification.related.type] ?? notification.related.type} · ${notification.related.id}`;
};

const actionIcon = (action: NotificationAction) => {
	if (action.kind === "retry") return RefreshCcw;
	if (action.kind === "open_related") return ExternalLink;
	if (action.kind === "accept_suggestion" || action.kind === "mark_handled") return CheckCircle2;
	if (action.kind === "dismiss" || action.kind === "reject_suggestion") return CircleSlash2;
	return Bell;
};

const handleFilterChange = (nextFilter: NotificationFilter) => {
	void load(nextFilter);
};

const handleOpenRelated = (notification: NotificationEvent) => {
	if (!notification.related) return;
	if (notification.related.type === "file") {
		emit("openFile", notification.related.id);
		return;
	}
	if (notification.related.type === "session") {
		emit("openSession", notification.related.id);
		return;
	}
	if (notification.related.type === "task" || notification.related.type === "milestone") {
		emit("openTasks");
		return;
	}
	if (notification.related.type === "project") {
		emit("openProject", notification.related.id);
		return;
	}
	if (notification.related.type === "automation") {
		emit("openAutomation");
	}
};

const actionKey = (notification: NotificationEvent, action: NotificationAction) =>
	`${notification.id}:${action.id}`;

const isActionPending = (notification: NotificationEvent, action: NotificationAction) =>
	pendingActionKeys.value.has(actionKey(notification, action));

const setActionPending = (
	notification: NotificationEvent,
	action: NotificationAction,
	pending: boolean,
) => {
	const next = new Set(pendingActionKeys.value);
	const key = actionKey(notification, action);
	if (pending) {
		next.add(key);
	} else {
		next.delete(key);
	}
	pendingActionKeys.value = next;
};

const handleAction = async (notification: NotificationEvent, action: NotificationAction) => {
	if (action.kind === "open_related") {
		handleOpenRelated(notification);
		return;
	}
	if (isActionPending(notification, action)) return;
	setActionPending(notification, action, true);
	try {
		const result = await runAction(notification.id, action.id);
		if (result.success) emit("notificationsUpdated");
	} finally {
		setActionPending(notification, action, false);
	}
};
</script>

<template>
	<div class="flex h-full min-h-0 flex-col bg-background">
		<!-- Header -->
		<header class="shrink-0 border-b border-subtle px-5 py-4">
			<div class="mx-auto flex max-w-3xl items-center justify-between gap-3">
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<h2 class="text-body-lg font-semibold text-foreground">通知</h2>
						<span
							v-if="actionableCount > 0"
							class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-medium text-primary"
						>
							<span class="size-1.5 rounded-full bg-primary"></span>
							{{ actionableCount }} 待处理
						</span>
					</div>
					<p class="mt-0.5 text-caption text-muted-foreground">
						来自自动化、任务回顾和文件处理的通知与建议
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					class="h-8 gap-1.5 text-caption"
					:disabled="isLoading"
					@click="load(filter)"
				>
					<LoaderCircle v-if="isLoading" class="size-3.5 animate-spin" />
					<RefreshCcw v-else class="size-3.5" />
					刷新
				</Button>
			</div>

			<!-- 筛选芯片 -->
			<div class="mx-auto mt-4 flex max-w-3xl flex-wrap gap-1.5">
				<button
					v-for="item in filterOptions"
					:key="item.id"
					type="button"
					class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-caption transition-colors"
					:class="filter === item.id ? 'bg-primary text-primary-foreground' : 'bg-soft text-muted-foreground hover:bg-hover'"
					@click="handleFilterChange(item.id)"
				>
					{{ item.label }}
					<span class="tabular-nums opacity-70">{{ counts[item.id] }}</span>
				</button>
			</div>
		</header>

		<ScrollArea class="min-h-0 flex-1">
			<div class="mx-auto max-w-3xl space-y-3 px-5 py-4">
				<!-- 错误 -->
				<div
					v-if="error"
					class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-body-sm text-destructive"
				>
					{{ error }}
				</div>

				<!-- 空状态 -->
				<div
					v-else-if="!isLoading && notifications.length === 0"
					class="flex flex-col items-center py-20"
				>
					<div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-soft text-muted-foreground/50">
						<Bell class="size-6" />
					</div>
					<p class="text-body text-muted-foreground">当前筛选下没有通知</p>
					<p class="mt-1 text-caption text-muted-foreground/60">新通知会自动出现在这里</p>
				</div>

				<!-- 加载中 -->
				<div
					v-else-if="isLoading"
					class="flex items-center justify-center gap-2 py-12 text-caption text-muted-foreground"
				>
					<LoaderCircle class="size-4 animate-spin" />
					加载中...
				</div>

				<!-- 通知列表 -->
				<article
					v-for="notification in notifications"
					:key="notification.id"
					class="group rounded-lg border border-subtle bg-card p-4 transition-all hover:border-default hover:shadow-sm"
				>
					<div class="flex items-start gap-3">
						<!-- 类型图标 -->
						<div
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
							:class="{
								'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400': notification.type === 'suggestion',
								'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400': notification.type === 'confirmation',
								'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400': notification.type === 'failure',
								'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400': notification.type === 'warning',
								'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400': notification.type === 'info',
							}"
						>
							<component :is="typeIconMap[notification.type]" class="size-4" />
						</div>

						<div class="min-w-0 flex-1">
							<!-- 标题行 -->
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="min-w-0 flex-1 truncate text-body font-semibold text-foreground">
									{{ notification.title }}
								</h3>
								<!-- 状态指示 -->
								<span class="inline-flex items-center gap-1 text-caption text-muted-foreground">
									<span
										class="size-1.5 rounded-full"
										:class="{
											'bg-blue-500': notification.status === 'unread',
											'bg-amber-500': notification.status === 'pending',
											'bg-emerald-500': notification.status === 'handled',
											'bg-slate-400': notification.status === 'dismissed',
											'bg-red-500': notification.status === 'failed',
										}"
									></span>
									{{ statusLabels[notification.status] ?? notification.status }}
								</span>
							</div>

							<!-- 正文 -->
							<p class="mt-2 whitespace-pre-wrap text-body-sm leading-relaxed text-muted-foreground/80">
								{{ notification.body }}
							</p>

							<!-- 元数据行 -->
							<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground/60">
								<span class="inline-flex items-center gap-1">
									<component :is="typeIconMap[notification.type]" class="size-3" />
									{{ typeLabels[notification.type] }}
								</span>
								<span>{{ sourceLabel(notification.source) }}</span>
								<span class="tabular-nums">{{ formatTime(notification.createdAt) }}</span>
								<span
									v-if="notification.related"
									class="max-w-full truncate"
								>
									{{ relatedLabel(notification) }}
								</span>
							</div>

							<!-- 操作按钮 -->
							<div v-if="notification.actions.length" class="mt-4 flex flex-wrap gap-2">
								<Button
									v-for="action in notification.actions"
									:key="action.id"
									size="sm"
									:variant="action.kind === 'accept_suggestion' || action.kind === 'mark_handled' ? 'default' : 'outline'"
									:disabled="isActionPending(notification, action)"
									class="h-7 gap-1.5 text-caption"
									@click="handleAction(notification, action)"
								>
									<component :is="actionIcon(action)" class="size-3.5" />
									{{ action.label }}
								</Button>
							</div>
						</div>
					</div>
				</article>
			</div>
		</ScrollArea>
	</div>
</template>
