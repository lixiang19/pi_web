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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
		<header class="shrink-0 border-b border-border/60 px-5 py-4">
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0">
					<h2 class="text-base font-semibold text-foreground">通知与建议</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						{{ actionableCount }} 条待处理
					</p>
				</div>
				<Button variant="outline" size="sm" :disabled="isLoading" @click="load(filter)">
					<LoaderCircle v-if="isLoading" class="mr-1.5 size-3.5 animate-spin" />
					<RefreshCcw v-else class="mr-1.5 size-3.5" />
					刷新
				</Button>
			</div>

			<Tabs :model-value="filter" class="mt-4">
				<TabsList class="grid w-full grid-cols-5">
					<TabsTrigger
						v-for="item in filterOptions"
						:key="item.id"
						:value="item.id"
						class="gap-1.5"
						@click="handleFilterChange(item.id)"
					>
						<span>{{ item.label }}</span>
						<span class="text-[10px] text-muted-foreground">{{ counts[item.id] }}</span>
					</TabsTrigger>
				</TabsList>
			</Tabs>
		</header>

		<ScrollArea class="min-h-0 flex-1">
			<div class="space-y-3 p-5">
				<div
					v-if="error"
					class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
				>
					{{ error }}
				</div>

				<div
					v-else-if="!isLoading && notifications.length === 0"
					class="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
				>
					当前筛选下没有通知
				</div>

				<article
					v-for="notification in notifications"
					:key="notification.id"
					class="rounded-md border border-border bg-card p-4 shadow-sm"
				>
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
						>
							<component :is="typeIconMap[notification.type]" class="size-4" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
									{{ notification.title }}
								</h3>
								<Badge variant="secondary" class="shrink-0">
									{{ typeLabels[notification.type] }}
								</Badge>
								<Badge variant="outline" class="shrink-0">
									{{ statusLabels[notification.status] ?? notification.status }}
								</Badge>
							</div>

							<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
								{{ notification.body }}
							</p>

							<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
								<span>{{ sourceLabel(notification.source) }}</span>
								<span>{{ formatTime(notification.createdAt) }}</span>
								<span v-if="notification.related" class="max-w-full truncate">
									{{ relatedLabel(notification) }}
								</span>
							</div>

							<div v-if="notification.actions.length" class="mt-4 flex flex-wrap gap-2">
								<Button
									v-for="action in notification.actions"
									:key="action.id"
									size="sm"
									:variant="action.kind === 'accept_suggestion' ? 'default' : 'outline'"
									:disabled="isActionPending(notification, action)"
									@click="handleAction(notification, action)"
								>
									<component :is="actionIcon(action)" class="mr-1.5 size-3.5" />
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
