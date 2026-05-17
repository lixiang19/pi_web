<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import {
	CalendarDays,
	CheckCircle2,
	CircleSlash2,
	Flag,
	LayoutGrid,
	List,
	LoaderCircle,
	Plus,
	RefreshCcw,
	Sparkles,
	Trash2,
} from "lucide-vue-next";
import { toast } from "vue-sonner";

import {
	useWorkspaceTasks,
	type MilestoneItem,
	type TaskItem,
} from "@/composables/useWorkspaceTasks";
import { useProjects } from "@/composables/useProjects";
import { useNotifications } from "@/composables/useNotifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	requestTaskReview,
	type NotificationEvent,
	type WorkspaceTaskPriority,
	type WorkspaceTaskStatus,
} from "@/lib/api";

const emit = defineEmits<{
	openSession: [sessionId: string];
	notificationsUpdated: [];
}>();

const props = defineProps<{ workspaceDir: string }>();

const {
	tasks,
	milestones,
	stats,
	tasksByStatus,
	tasksByMilestone,
	isLoading,
	addTask,
	addMilestone,
	removeTask,
	updateTask,
	updateMilestone,
	removeMilestone,
	openProcessingSession,
	projectFilter,
	load,
} = useWorkspaceTasks();

const { projects, load: loadProjects } = useProjects();
const notificationsStore = useNotifications(() => props.workspaceDir);

const viewMode = ref<"kanban" | "list" | "calendar" | "milestones">("kanban");
const newTaskTitle = ref("");
const newTaskAcceptanceCriteria = ref("");
const newTaskPriority = ref<WorkspaceTaskPriority>("normal");
const newTaskDueDate = ref("");
const newTaskMilestoneId = ref<string | undefined>();
const newTaskProjectId = ref<string | undefined>("__inherit__");
const newMilestoneTitle = ref("");
const newMilestoneGoal = ref("");
const newMilestoneAcceptanceCriteria = ref("");
const newMilestoneDueDate = ref("");
const newMilestoneProjectId = ref<string | undefined>("__none__");
const selectedTask = ref<TaskItem | null>(null);
const selectedMilestone = ref<MilestoneItem | null>(null);
const draggedTask = ref<TaskItem | null>(null);
const kanbanMilestoneFilter = ref("all");
const pendingDeleteTask = ref<TaskItem | null>(null);
const pendingDeleteMilestone = ref<MilestoneItem | null>(null);
const isReviewingTasks = ref(false);
const pendingReviewActionKeys = ref(new Set<string>());
const reviewRefreshTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const isMounted = ref(true);
const currentMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

const editTaskTitle = ref("");
const editTaskAcceptanceCriteria = ref("");
const editTaskPriority = ref<WorkspaceTaskPriority>("normal");
const editTaskStatus = ref<WorkspaceTaskStatus>("pending");
const editTaskDueDate = ref("");
const editTaskMilestoneId = ref("");
const editTaskBlockedReason = ref("");
const editTaskProjectId = ref<string | undefined>("__inherit__");

const editMilestoneTitle = ref("");
const editMilestoneGoal = ref("");
const editMilestoneAcceptanceCriteria = ref("");
const editMilestoneStatus = ref<WorkspaceTaskStatus>("pending");
const editMilestoneDueDate = ref("");
const editMilestoneProjectId = ref<string | undefined>("__none__");

// Load projects once when component mounts
loadProjects();

const statusColumns: Array<{ key: WorkspaceTaskStatus; label: string }> = [
	{ key: "pending", label: "待处理" },
	{ key: "in_progress", label: "进行中" },
	{ key: "blocked", label: "阻塞" },
	{ key: "reviewing", label: "审核中" },
	{ key: "completed", label: "完成" },
];

const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];

// For project filter: all, none, specific projects
const filterProjectOptions = computed(() => [
	{ id: "__all__", name: "全部项目" },
	{ id: "__none__", name: "无项目" },
	...projects.value.map((p) => ({ id: p.id, name: p.name })),
]);

// For task assignment: inherit from milestone (default), none, specific projects
const taskProjectOptions = computed(() => [
	{ id: "__inherit__", name: "继承里程碑" },
	{ id: "__none__", name: "无项目" },
	...projects.value.map((p) => ({ id: p.id, name: p.name })),
]);

// For milestone assignment: none, specific projects (no "all", no "inherit")
const milestoneProjectOptions = computed(() => [
	{ id: "__none__", name: "无项目" },
	...projects.value.map((p) => ({ id: p.id, name: p.name })),
]);

const projectName = (projectId: string | null | undefined) => {
	if (!projectId) return "无项目";
	return projects.value.find((p) => p.id === projectId)?.name ?? projectId;
};

const priorityLabel = (priority: WorkspaceTaskPriority) =>
	priority === "urgent" ? "紧急" : priority === "important" ? "重要" : "普通";

const statusLabel = (status: WorkspaceTaskStatus) =>
	statusColumns.find((column) => column.key === status)?.label ?? status;

const formatDate = (value: number | null) => {
	if (!value) return "无截止日期";
	return new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
	}).format(value);
};

const formatInputDate = (value: number | null) =>
	value ? new Date(value).toISOString().slice(0, 10) : "";

const toTimestamp = (value: string) => (value ? new Date(value).getTime() : null);

const selectedTaskMilestone = computed(() =>
	milestones.value.find(
		(milestone) => milestone.id === selectedTask.value?.milestoneId,
	),
);

const detailOpen = computed(() => Boolean(selectedTask.value || selectedMilestone.value));

const filteredTasksByStatus = computed(() => {
	if (kanbanMilestoneFilter.value === "all") return tasksByStatus.value;
	return Object.fromEntries(
		statusColumns.map((column) => [
			column.key,
			tasksByStatus.value[column.key].filter(
				(task) => task.milestoneId === kanbanMilestoneFilter.value,
			),
		]),
	) as Record<WorkspaceTaskStatus, TaskItem[]>;
});

const selectedMilestoneTasks = computed(() => {
	if (!selectedMilestone.value) return [];
	return (
		tasksByMilestone.value.find(
			(group) => group.milestone.id === selectedMilestone.value?.id,
		)?.tasks ?? []
	);
});

const taskReviewNotifications = computed(() =>
	notificationsStore.notifications.value.filter(
		(notification) =>
			notification.eventType === "task_review.suggestion" &&
			notification.status !== "handled" &&
			notification.status !== "dismissed",
	),
);

const selectedReviewNotifications = computed(() => {
	const task = selectedTask.value;
	if (task) {
		return taskReviewNotifications.value.filter(
			(notification) =>
				notification.related?.type === "task" &&
				notification.related.id === task.id,
		);
	}
	const milestone = selectedMilestone.value;
	if (milestone) {
		return taskReviewNotifications.value.filter(
			(notification) =>
				notification.related?.type === "milestone" &&
				notification.related.id === milestone.id,
		);
	}
	return [];
});

const calendarCells = computed(() => {
	const monthStart = currentMonth.value;
	const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
	const offset = (firstDay.getDay() + 6) % 7;
	const start = new Date(firstDay);
	start.setDate(firstDay.getDate() - offset);

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const startAt = new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
		).getTime();
		const endAt = startAt + 86400000;
		const tasks = tasksByMilestone.value
			.flatMap((group) => group.tasks)
			.filter(
				(task) =>
					task.dueDate !== null &&
					task.dueDate >= startAt &&
					task.dueDate < endAt,
			);
		return {
			key: date.toISOString().slice(0, 10),
			date,
			isCurrentMonth: date.getMonth() === monthStart.getMonth(),
			tasks,
		};
	});
});

const undatedTasks = computed(() =>
	tasksByMilestone.value.flatMap((group) =>
		group.tasks.filter((task) => task.dueDate === null),
	),
);

const monthTitle = computed(() =>
	new Intl.DateTimeFormat("zh-CN", {
		year: "numeric",
		month: "long",
	}).format(currentMonth.value),
);

const allowedNextStatuses: Record<WorkspaceTaskStatus, WorkspaceTaskStatus[]> = {
	pending: ["in_progress"],
	in_progress: ["blocked", "reviewing"],
	blocked: ["in_progress"],
	reviewing: ["completed"],
	completed: [],
};

const canSelectStatus = (
	currentStatus: WorkspaceTaskStatus,
	nextStatus: WorkspaceTaskStatus,
) => currentStatus === nextStatus || allowedNextStatuses[currentStatus].includes(nextStatus);

const milestoneColor = (milestoneId: string) =>
	milestones.value.find((milestone) => milestone.id === milestoneId)?.color ??
	"#64748b";

const openTask = (task: TaskItem) => {
	selectedTask.value = task;
	selectedMilestone.value = null;
	editTaskTitle.value = task.title;
	editTaskAcceptanceCriteria.value = task.acceptanceCriteria ?? "";
	editTaskPriority.value = task.priority;
	editTaskStatus.value = task.status;
	editTaskDueDate.value = formatInputDate(task.dueDate);
	editTaskMilestoneId.value = task.milestoneId ?? "";
	editTaskBlockedReason.value = task.blockedReason ?? "";
	// Editing: no "inherit" option, default to current or none
	editTaskProjectId.value = task.projectId ?? "__none__";
};

const openMilestone = (milestone: MilestoneItem) => {
	selectedMilestone.value = milestone;
	selectedTask.value = null;
	editMilestoneTitle.value = milestone.title;
	editMilestoneGoal.value = milestone.goal;
	editMilestoneAcceptanceCriteria.value = milestone.acceptanceCriteria;
	editMilestoneStatus.value = milestone.status;
	editMilestoneDueDate.value = formatInputDate(milestone.dueDate);
	editMilestoneProjectId.value = milestone.projectId ?? "__none__";
};

const closeDetail = () => {
	selectedTask.value = null;
	selectedMilestone.value = null;
};

const changeMonth = (offset: number) => {
	currentMonth.value = new Date(
		currentMonth.value.getFullYear(),
		currentMonth.value.getMonth() + offset,
		1);
};

const resolveNewTaskProjectId = (value: string | undefined): string | null | undefined => {
	if (value === "__inherit__") return undefined; // let backend inherit from milestone
	if (value === "__none__") return null;
	if (value === undefined || value === "") return undefined;
	return value;
};

const resolveEditTaskProjectId = (value: string | undefined): string | null => {
	if (value === "__none__") return null;
	if (value === undefined || value === "") return null;
	return value;
};

const resolveMilestoneProjectId = (value: string | undefined): string | null => {
	if (value === "__none__") return null;
	if (value === undefined || value === "") return null;
	return value;
};

const handleProjectFilterChange = (value: unknown) => {
	const str = String(value);
	if (str === "__all__") {
		projectFilter.value = undefined;
	} else if (str === "__none__") {
		projectFilter.value = null;
	} else {
		projectFilter.value = str;
	}
};

const handleAddTask = async () => {
	const title = newTaskTitle.value.trim();
	const acceptanceCriteria = newTaskAcceptanceCriteria.value.trim();
	if (!title || !acceptanceCriteria) return;
	const result = await addTask({
		title,
		priority: newTaskPriority.value,
		acceptanceCriteria,
		dueDate: toTimestamp(newTaskDueDate.value),
		milestoneId: newTaskMilestoneId.value || null,
		projectId: resolveNewTaskProjectId(newTaskProjectId.value),
	});
	if (!result.success) return;
	newTaskTitle.value = "";
	newTaskAcceptanceCriteria.value = "";
	newTaskPriority.value = "normal";
	newTaskDueDate.value = "";
	newTaskMilestoneId.value = undefined;
	newTaskProjectId.value = "__inherit__";
};

const handleAddMilestone = async () => {
	const title = newMilestoneTitle.value.trim();
	const goal = newMilestoneGoal.value.trim();
	const acceptanceCriteria = newMilestoneAcceptanceCriteria.value.trim();
	if (!title || !goal || !acceptanceCriteria) return;
	const result = await addMilestone({
		title,
		goal,
		acceptanceCriteria,
		dueDate: toTimestamp(newMilestoneDueDate.value),
		projectId: resolveMilestoneProjectId(newMilestoneProjectId.value),
	});
	if (!result.success) return;
	newMilestoneTitle.value = "";
	newMilestoneGoal.value = "";
	newMilestoneAcceptanceCriteria.value = "";
	newMilestoneDueDate.value = "";
	newMilestoneProjectId.value = "__none__";
};

const handleDropOnStatus = async (status: WorkspaceTaskStatus) => {
	if (!draggedTask.value) return;
	if (!canSelectStatus(draggedTask.value.status, status)) {
		draggedTask.value = null;
		return;
	}
	await updateTask(draggedTask.value.id, {
		status,
		sortOrder: Date.now(),
		actor: "user",
	});
	draggedTask.value = null;
};

const handleDropOnTask = async (targetTask: TaskItem) => {
	if (!draggedTask.value || draggedTask.value.id === targetTask.id) return;
	if (!canSelectStatus(draggedTask.value.status, targetTask.status)) {
		draggedTask.value = null;
		return;
	}
	const sameStatus = draggedTask.value.status === targetTask.status;
	await updateTask(draggedTask.value.id, {
		status: targetTask.status,
		sortOrder: Math.max(0, (targetTask.sortOrder ?? 0) - 1),
		actor: "user",
	});
	if (!sameStatus) draggedTask.value = null;
};

const confirmDeleteTask = async () => {
	if (!pendingDeleteTask.value) return;
	const result = await removeTask(pendingDeleteTask.value.id);
	if (result.success) {
		if (selectedTask.value?.id === pendingDeleteTask.value.id) closeDetail();
	}
	pendingDeleteTask.value = null;
};

const confirmDeleteMilestone = async () => {
	if (!pendingDeleteMilestone.value) return;
	const result = await removeMilestone(pendingDeleteMilestone.value.id);
	if (result.success) {
		if (selectedMilestone.value?.id === pendingDeleteMilestone.value.id) closeDetail();
	}
	pendingDeleteMilestone.value = null;
};

const saveSelectedTask = async () => {
	if (!selectedTask.value) return;
	const result = await updateTask(selectedTask.value.id, {
		title: editTaskTitle.value.trim(),
		acceptanceCriteria: editTaskAcceptanceCriteria.value.trim(),
		priority: editTaskPriority.value,
		status: editTaskStatus.value,
		dueDate: toTimestamp(editTaskDueDate.value),
		milestoneId: editTaskMilestoneId.value,
		blockedReason: editTaskBlockedReason.value.trim() || null,
		projectId: resolveEditTaskProjectId(editTaskProjectId.value),
		actor: "user",
	});
	if (result.success) {
		selectedTask.value = result.task;
	}
};

const saveSelectedMilestone = async () => {
	if (!selectedMilestone.value) return;
	const result = await updateMilestone(selectedMilestone.value.id, {
		title: editMilestoneTitle.value.trim(),
		goal: editMilestoneGoal.value.trim(),
		acceptanceCriteria: editMilestoneAcceptanceCriteria.value.trim(),
		status: editMilestoneStatus.value,
		dueDate: toTimestamp(editMilestoneDueDate.value),
		projectId: resolveMilestoneProjectId(editMilestoneProjectId.value),
		actor: "user",
	});
	if (result.success) {
		selectedMilestone.value = result.milestone;
	}
};

const handleOpenProcessingSession = async () => {
	if (!selectedTask.value) return;
	const result = await openProcessingSession(selectedTask.value.id);
	if (result.success && result.sessionId) {
		emit("openSession", result.sessionId);
	}
};

const refreshSelection = () => {
	if (selectedTask.value) {
		selectedTask.value = tasks.value.find((task) => task.id === selectedTask.value?.id) ?? selectedTask.value;
	}
	if (selectedMilestone.value) {
		selectedMilestone.value =
			milestones.value.find((milestone) => milestone.id === selectedMilestone.value?.id) ??
			selectedMilestone.value;
	}
};

const clearReviewRefreshTimer = () => {
	if (reviewRefreshTimer.value) {
		clearTimeout(reviewRefreshTimer.value);
		reviewRefreshTimer.value = null;
	}
};

const scheduleReviewSuggestionRefresh = (remainingAttempts = 8) => {
	clearReviewRefreshTimer();
	const tick = async (remaining: number) => {
		if (!isMounted.value) return;
		await notificationsStore.load("suggestions");
		if (!isMounted.value) return;
		emit("notificationsUpdated");
		if (remaining <= 1) {
			reviewRefreshTimer.value = null;
			return;
		}
		reviewRefreshTimer.value = setTimeout(() => {
			void tick(remaining - 1);
		}, 1500);
	};
	reviewRefreshTimer.value = setTimeout(() => {
		void tick(remainingAttempts);
	}, 1000);
};

const handleRunTaskReview = async () => {
	if (isReviewingTasks.value) return;
	isReviewingTasks.value = true;
	try {
		await requestTaskReview();
		await notificationsStore.load("suggestions");
		emit("notificationsUpdated");
		scheduleReviewSuggestionRefresh();
		toast.success("任务回顾已进入后台队列");
	} catch (error) {
		toast.error("触发任务回顾失败", {
			description: error instanceof Error ? error.message : String(error),
		});
	} finally {
		isReviewingTasks.value = false;
	}
};

const reviewActionKey = (notification: NotificationEvent, actionId: string) =>
	`${notification.id}:${actionId}`;

const isReviewActionPending = (notification: NotificationEvent, actionId: string) =>
	pendingReviewActionKeys.value.has(reviewActionKey(notification, actionId));

const setReviewActionPending = (
	notification: NotificationEvent,
	actionId: string,
	pending: boolean,
) => {
	const next = new Set(pendingReviewActionKeys.value);
	const key = reviewActionKey(notification, actionId);
	if (pending) next.add(key);
	else next.delete(key);
	pendingReviewActionKeys.value = next;
};

const handleReviewAction = async (notification: NotificationEvent, actionId: string) => {
	if (isReviewActionPending(notification, actionId)) return;
	setReviewActionPending(notification, actionId, true);
	try {
		const result = await notificationsStore.runAction(notification.id, actionId);
		if (result.success) {
			await load();
			refreshSelection();
			await notificationsStore.load("suggestions");
			emit("notificationsUpdated");
		}
	} finally {
		setReviewActionPending(notification, actionId, false);
	}
};

onBeforeUnmount(() => {
	isMounted.value = false;
	clearReviewRefreshTimer();
});
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div class="flex shrink-0 flex-col gap-3 border-b border-subtle px-5 py-3">
        <!-- 标题行 -->
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-body-lg font-semibold text-foreground">任务</h2>
            <p class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
              <span class="inline-flex items-center gap-1"><span class="size-1.5 rounded-full bg-amber-400"></span>待处理 {{ stats.pending }}</span>
              <span class="inline-flex items-center gap-1"><span class="size-1.5 rounded-full bg-sky-500"></span>进行中 {{ stats.inProgress }}</span>
              <span class="inline-flex items-center gap-1"><span class="size-1.5 rounded-full bg-red-400"></span>阻塞 {{ stats.blocked }}</span>
              <span class="inline-flex items-center gap-1"><span class="size-1.5 rounded-full bg-purple-400"></span>审核中 {{ stats.reviewing }}</span>
              <span class="inline-flex items-center gap-1"><span class="size-1.5 rounded-full bg-emerald-400"></span>完成 {{ stats.done }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-caption text-muted-foreground">项目筛选</span>
            <Select :model-value="projectFilter === undefined ? '__all__' : projectFilter === null ? '__none__' : projectFilter" @update:model-value="handleProjectFilterChange">
              <SelectTrigger size="sm" class="w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in filterProjectOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" class="gap-1 text-caption" :disabled="isReviewingTasks" @click="handleRunTaskReview">
              <LoaderCircle v-if="isReviewingTasks" class="size-3 animate-spin" />
              <RefreshCcw v-else class="size-3" />
              任务回顾
            </Button>
          </div>
        </div>

        <!-- 快速新建行 -->
        <div class="flex flex-wrap items-end gap-2">
          <Input v-model="newTaskTitle" class="h-8 w-48 text-body-sm" placeholder="任务标题" @keydown.enter="handleAddTask" />
          <Input v-model="newTaskAcceptanceCriteria" class="h-8 flex-1 min-w-48 text-body-sm" placeholder="完成标准（必填）" @keydown.enter="handleAddTask" />
          <Select v-model="newTaskPriority">
            <SelectTrigger size="sm" class="w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">普通</SelectItem>
              <SelectItem value="important">重要</SelectItem>
              <SelectItem value="urgent">紧急</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" class="gap-1 text-caption" :disabled="!newTaskTitle.trim() || !newTaskAcceptanceCriteria.trim()" @click="handleAddTask">
            <Plus class="size-3.5" />新建任务
          </Button>
        </div>
      </div>

      <Tabs v-model="viewMode" class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="shrink-0 px-4 pt-3">
          <TabsList class="inline-flex h-8 w-auto gap-0.5 rounded-lg bg-soft p-0.5">
            <TabsTrigger value="kanban" class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-caption transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"><LayoutGrid class="size-3.5" />看板</TabsTrigger>
            <TabsTrigger value="list" class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-caption transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"><List class="size-3.5" />列表</TabsTrigger>
            <TabsTrigger value="calendar" class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-caption transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"><CalendarDays class="size-3.5" />日历</TabsTrigger>
            <TabsTrigger value="milestones" class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-caption transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"><Flag class="size-3.5" />里程碑</TabsTrigger>
          </TabsList>
        </div>

        <div v-if="isLoading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle class="size-4 animate-spin" />加载中...
        </div>

        <TabsContent v-else value="kanban" class="m-0 min-h-0 flex-1 overflow-auto p-5">
          <div class="mb-4 flex items-center gap-2">
            <span class="text-caption text-muted-foreground">里程碑筛选</span>
            <Select v-model="kanbanMilestoneFilter">
              <SelectTrigger size="sm" class="w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部里程碑</SelectItem>
                <SelectItem v-for="milestone in milestones" :key="milestone.id" :value="milestone.id">
                  {{ milestone.title }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex min-w-[980px] gap-4">
            <section
              v-for="column in statusColumns"
              :key="column.key"
              class="min-h-[420px] flex-1 rounded-xl border border-subtle bg-subtle p-3"
              @dragover.prevent
              @drop="handleDropOnStatus(column.key)"
            >
              <div class="mb-3 flex items-center justify-between px-1">
                <div class="flex items-center gap-2">
                  <h3 class="text-body-sm font-semibold text-foreground">{{ column.label }}</h3>
                  <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-micro font-medium text-muted-foreground shadow-sm">{{ filteredTasksByStatus[column.key].length }}</span>
                </div>
              </div>
              <div class="space-y-2.5">
                <button
                  v-for="task in filteredTasksByStatus[column.key]"
                  :key="task.id"
                  type="button"
                  draggable="true"
                  class="group w-full cursor-grab rounded-xl border border-subtle bg-card p-3.5 text-left shadow-sm transition-all hover:border-default hover:shadow-md active:cursor-grabbing"
                  @dragstart="draggedTask = task"
                  @dragover.prevent
                  @drop.stop="handleDropOnTask(task)"
                  @click="openTask(task)"
                >
                  <!-- 顶部色条：里程碑颜色 -->
                  <div class="mb-2.5 h-0.5 rounded-full" :style="{ backgroundColor: milestoneColor(task.milestoneId ?? '') }"></div>
                  <div class="flex items-start justify-between gap-2">
                    <p class="min-w-0 flex-1 text-body-sm font-medium leading-snug text-foreground">{{ task.title }}</p>
                    <!-- 优先级圆点 -->
                    <span
                      class="mt-0.5 shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-medium"
                      :class="{
                        'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400': task.priority === 'urgent',
                        'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400': task.priority === 'important',
                        'bg-slate-50 text-slate-600 dark:bg-slate-950/30 dark:text-slate-400': task.priority === 'normal',
                      }"
                    >
                      <span class="size-1.5 rounded-full" :class="{
                        'bg-red-500': task.priority === 'urgent',
                        'bg-orange-400': task.priority === 'important',
                        'bg-slate-400': task.priority === 'normal',
                      }"></span>
                      {{ priorityLabel(task.priority) }}
                    </span>
                  </div>
                  <p class="mt-1.5 line-clamp-2 text-caption leading-relaxed text-muted-foreground/70">{{ task.acceptanceCriteria }}</p>
                  <div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted-foreground/50">
                    <span v-if="task.projectId">{{ projectName(task.projectId) }}</span>
                    <span v-if="task.dueDate">{{ formatDate(task.dueDate) }}</span>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="list" class="m-0 min-h-0 flex-1 overflow-auto p-5">
          <div v-if="tasksByMilestone.length === 0" class="flex flex-col items-center py-20">
            <div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-soft text-muted-foreground/50">
              <CheckCircle2 class="size-6" />
            </div>
            <p class="text-body text-muted-foreground">没有任务</p>
            <p class="mt-1 text-caption text-muted-foreground/60">在上方快速新建栏添加第一个任务</p>
          </div>
          <section v-for="group in tasksByMilestone" :key="group.milestone.id" class="mb-6">
            <button type="button" class="mb-2.5 flex items-center gap-2 text-left" @click="openMilestone(group.milestone)">
              <span class="inline-flex size-3 rounded-full" :style="{ backgroundColor: group.milestone.color }"></span>
              <h3 class="text-body-sm font-semibold text-foreground">{{ group.milestone.title }}</h3>
              <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-soft px-1.5 text-micro font-medium text-muted-foreground">{{ group.tasks.length }}</span>
            </button>
            <div class="overflow-hidden rounded-xl border border-subtle bg-card">
                              <button v-for="task in group.tasks" :key="task.id" type="button" class="flex w-full items-center gap-3 border-b border-subtle px-4 py-2.5 text-left last:border-b-0 transition-colors hover:bg-soft" @click="openTask(task)">
                <!-- 优先级竖线 -->
                <div class="h-6 w-0.5 shrink-0 rounded-full" :class="{
                  'bg-red-500': task.priority === 'urgent',
                  'bg-orange-400': task.priority === 'important',
                  'bg-slate-300 dark:bg-slate-600': task.priority === 'normal',
                }"></div>
                <!-- 状态圆点 -->
                <span class="inline-flex items-center gap-1.5 text-caption text-muted-foreground w-20 shrink-0">
                  <span class="size-1.5 rounded-full" :class="{
                    'bg-amber-400': task.status === 'pending',
                    'bg-sky-500': task.status === 'in_progress',
                    'bg-red-400': task.status === 'blocked',
                    'bg-purple-400': task.status === 'reviewing',
                    'bg-emerald-400': task.status === 'completed',
                  }"></span>
                  {{ statusLabel(task.status) }}
                </span>
                <span class="min-w-0 flex-1 truncate text-body-sm text-foreground">{{ task.title }}</span>
                <span class="w-24 truncate text-caption text-muted-foreground/60">{{ projectName(task.projectId) }}</span>
                <span class="shrink-0 text-caption text-muted-foreground/60 tabular-nums">{{ formatDate(task.dueDate) }}</span>
              </button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="calendar" class="m-0 min-h-0 flex-1 overflow-auto p-5">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-body-lg font-semibold text-foreground"><CalendarDays class="size-5 text-muted-foreground" />{{ monthTitle }}</h3>
            <div class="flex gap-1.5">
              <Button variant="outline" size="sm" class="px-2.5 text-caption" @click="changeMonth(-1)">上月</Button>
              <Button variant="outline" size="sm" class="px-2.5 text-caption" @click="changeMonth(1)">下月</Button>
            </div>
          </div>
          <div class="grid gap-4 lg:grid-cols-[1fr_260px]">
            <div class="overflow-hidden rounded-xl border border-subtle bg-card">
              <div class="grid grid-cols-7 border-b border-subtle bg-soft">
                <div v-for="label in weekLabels" :key="label" class="px-2 py-2.5 text-center text-caption font-medium text-muted-foreground">{{ label }}</div>
              </div>
              <div class="grid grid-cols-7">
                <div v-for="cell in calendarCells" :key="cell.key" class="min-h-[120px] border-b border-r border-subtle p-2 last:border-r-0 transition-colors" :class="cell.isCurrentMonth ? 'bg-background hover:bg-soft' : 'bg-subtle text-muted-foreground/50'">
                  <p class="mb-1.5 text-caption font-medium tabular-nums">{{ cell.date.getDate() }}</p>
                  <div class="space-y-1">
                    <button v-for="task in cell.tasks" :key="task.id" type="button" class="block w-full rounded-md px-1.5 py-1 text-left text-micro transition-opacity hover:opacity-80" :style="{ backgroundColor: `${milestoneColor(task.milestoneId ?? '')}18`, borderLeft: `3px solid ${milestoneColor(task.milestoneId ?? '')}` }" @click="openTask(task)">
                      {{ task.title }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <aside class="rounded-xl border border-subtle bg-card p-4">
              <h3 class="mb-3 text-body-sm font-semibold text-foreground">无截止日期</h3>
              <div class="space-y-1">
                <button v-for="task in undatedTasks" :key="task.id" type="button" class="block w-full rounded-md px-2 py-1.5 text-left text-body-sm text-foreground transition-colors hover:bg-soft" @click="openTask(task)">
                  {{ task.title }}
                </button>
              </div>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="milestones" class="m-0 min-h-0 flex-1 overflow-auto p-5">
          <div class="mb-5 flex flex-wrap items-end gap-2">
            <Input v-model="newMilestoneTitle" class="h-8 w-48 text-body-sm" placeholder="里程碑标题" />
            <Input v-model="newMilestoneGoal" class="h-8 min-w-32 flex-1 text-body-sm" placeholder="目标" />
            <Input v-model="newMilestoneAcceptanceCriteria" class="h-8 min-w-32 flex-1 text-body-sm" placeholder="完成标准" />
            <Input v-model="newMilestoneDueDate" type="date" class="h-8 w-36 text-body-sm" />
            <Select v-model="newMilestoneProjectId">
              <SelectTrigger size="sm" class="w-36 text-body-sm"><SelectValue placeholder="项目" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in milestoneProjectOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" class="text-caption" :disabled="!newMilestoneTitle.trim() || !newMilestoneGoal.trim() || !newMilestoneAcceptanceCriteria.trim()" @click="handleAddMilestone">新建</Button>
          </div>
          <div v-if="milestones.length === 0" class="flex flex-col items-center py-20">
            <div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-soft text-muted-foreground/50">
              <Flag class="size-6" />
            </div>
            <p class="text-body text-muted-foreground">没有里程碑</p>
            <p class="mt-1 text-caption text-muted-foreground/60">在上方创建第一个里程碑</p>
          </div>
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article v-for="milestone in milestones" :key="milestone.id" class="group rounded-xl border border-subtle bg-card p-4 transition-all hover:border-default hover:shadow-sm">
              <button type="button" class="block w-full text-left" @click="openMilestone(milestone)">
                <div class="flex items-center gap-2">
                  <span class="inline-flex size-2.5 rounded-full" :style="{ backgroundColor: milestone.color }"></span>
                  <h3 class="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{{ milestone.title }}</h3>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground/60">
                  <span class="inline-flex items-center gap-1">
                    <span class="size-1.5 rounded-full" :class="{
                      'bg-amber-400': milestone.status === 'pending',
                      'bg-sky-500': milestone.status === 'in_progress',
                      'bg-red-400': milestone.status === 'blocked',
                      'bg-purple-400': milestone.status === 'reviewing',
                      'bg-emerald-400': milestone.status === 'completed',
                    }"></span>
                    {{ statusLabel(milestone.status) }}
                  </span>
                  <span>{{ milestone.taskCount }} 个任务</span>
                  <span>{{ formatDate(milestone.dueDate) }}</span>
                </div>
                <p class="mt-1 text-micro text-muted-foreground/50">{{ projectName(milestone.projectId) }}</p>
                <div class="mt-3 space-y-1">
                  <p class="text-body-sm text-muted-foreground"><span class="text-muted-foreground/50">目标：</span>{{ milestone.goal }}</p>
                  <p class="text-body-sm text-muted-foreground"><span class="text-muted-foreground/50">完成标准：</span>{{ milestone.acceptanceCriteria }}</p>
                </div>
              </button>
            </article>
          </div>
        </TabsContent>
      </Tabs>
    </div>

    <Sheet :open="detailOpen" @update:open="(open) => { if (!open) closeDetail() }">
      <SheetContent class="w-[420px] overflow-auto p-0 sm:max-w-[420px]">
        <!-- 任务详情 -->
        <div v-if="selectedTask" class="flex flex-col">
          <!-- 顶部色带 -->
          <div class="h-1 w-full" :style="{ backgroundColor: milestoneColor(selectedTask.milestoneId ?? '') }"></div>
          <div class="p-5">
            <SheetHeader class="mb-1">
              <SheetTitle class="text-lg leading-snug">{{ selectedTask.title }}</SheetTitle>
            </SheetHeader>
            <div class="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground/60">
              <span class="inline-flex items-center gap-1">
                <span class="size-1.5 rounded-full" :class="{
                  'bg-amber-400': selectedTask.status === 'pending',
                  'bg-sky-500': selectedTask.status === 'in_progress',
                  'bg-red-400': selectedTask.status === 'blocked',
                  'bg-purple-400': selectedTask.status === 'reviewing',
                  'bg-emerald-400': selectedTask.status === 'completed',
                }"></span>
                {{ statusLabel(selectedTask.status) }}
              </span>
              <span>{{ projectName(selectedTask.projectId) }}</span>
              <span>{{ selectedTaskMilestone?.title ?? '无里程碑' }}</span>
              <span class="tabular-nums">{{ formatDate(selectedTask.dueDate) }}</span>
            </div>

            <!-- 回顾建议 -->
            <div v-if="selectedReviewNotifications.length" class="mb-5 space-y-2">
              <p class="text-body-sm font-medium text-foreground">AI 建议</p>
              <article v-for="notification in selectedReviewNotifications" :key="notification.id" class="rounded-lg border border-indigo-200/50 bg-indigo-50/40 p-3 dark:border-indigo-800/40 dark:bg-indigo-950/20">
                <div class="flex items-start gap-2.5">
                  <Sparkles class="mt-0.5 size-4 shrink-0 text-indigo-500" />
                  <div class="min-w-0 flex-1">
                    <p class="text-body-sm font-medium text-foreground">{{ notification.title }}</p>
                    <p class="mt-1 whitespace-pre-wrap text-caption leading-relaxed text-muted-foreground">{{ notification.body }}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <Button
                        v-for="action in notification.actions.filter((item) => item.id === 'accept_suggestion' || item.id === 'reject_suggestion')"
                        :key="action.id"
                        size="sm"
                        :variant="action.id === 'accept_suggestion' ? 'default' : 'outline'"
                        class="gap-1 text-caption"
                        :disabled="isReviewActionPending(notification, action.id)"
                        @click="handleReviewAction(notification, action.id)"
                      >
                        <CheckCircle2 v-if="action.id === 'accept_suggestion'" class="size-3" />
                        <CircleSlash2 v-else class="size-3" />
                        {{ action.label }}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <!-- 编辑表单 -->
            <div class="space-y-3">
              <div>
                <label class="mb-1 block text-micro font-medium text-muted-foreground">标题</label>
                <Input v-model="editTaskTitle" class="h-8 text-body-sm" placeholder="标题" />
              </div>
              <div>
                <label class="mb-1 block text-micro font-medium text-muted-foreground">完成标准</label>
                <Textarea v-model="editTaskAcceptanceCriteria" class="min-h-20 text-body-sm" placeholder="完成标准" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">状态</label>
                  <Select v-model="editTaskStatus">
                    <SelectTrigger size="sm" class="text-body-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="column in statusColumns" :key="column.key" :value="column.key" :disabled="!canSelectStatus(selectedTask.status, column.key)">{{ column.label }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">优先级</label>
                  <Select v-model="editTaskPriority">
                    <SelectTrigger size="sm" class="text-body-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">普通</SelectItem>
                      <SelectItem value="important">重要</SelectItem>
                      <SelectItem value="urgent">紧急</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">里程碑</label>
                  <Select v-model="editTaskMilestoneId">
                    <SelectTrigger size="sm" class="text-body-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="milestone in milestones" :key="milestone.id" :value="milestone.id">{{ milestone.title }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">项目</label>
                  <Select v-model="editTaskProjectId">
                    <SelectTrigger size="sm" class="text-body-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in taskProjectOptions.filter(o => o.id !== '__inherit__')" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">截止日期</label>
                  <Input v-model="editTaskDueDate" type="date" class="text-body-sm" />
                </div>
                <div v-if="editTaskBlockedReason.trim() || selectedTask.status === 'blocked'">
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">阻塞原因</label>
                  <Input v-model="editTaskBlockedReason" class="text-body-sm" placeholder="阻塞原因" />
                </div>
              </div>
            </div>

            <!-- 底部操作 -->
            <div class="mt-6 flex gap-2">
              <Button size="sm" class="flex-1 text-body-sm" @click="saveSelectedTask">保存</Button>
              <Button size="sm" variant="outline" class="flex-1 text-body-sm" @click="handleOpenProcessingSession">
                {{ selectedTask.processingSessionId ? '继续处理' : '开始处理' }}
              </Button>
              <Button variant="destructive" size="sm" class="px-3 text-body-sm" @click="pendingDeleteTask = selectedTask">
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <!-- 里程碑详情 -->
        <div v-else-if="selectedMilestone" class="flex flex-col">
          <div class="h-1 w-full" :style="{ backgroundColor: selectedMilestone.color }"></div>
          <div class="p-5">
            <SheetHeader class="mb-1">
              <SheetTitle class="text-lg leading-snug">{{ selectedMilestone.title }}</SheetTitle>
            </SheetHeader>
            <div class="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground/60">
              <span class="inline-flex items-center gap-1">
                <span class="size-1.5 rounded-full" :class="{
                  'bg-amber-400': selectedMilestone.status === 'pending',
                  'bg-sky-500': selectedMilestone.status === 'in_progress',
                  'bg-red-400': selectedMilestone.status === 'blocked',
                  'bg-purple-400': selectedMilestone.status === 'reviewing',
                  'bg-emerald-400': selectedMilestone.status === 'completed',
                }"></span>
                {{ statusLabel(selectedMilestone.status) }}
              </span>
              <span>{{ projectName(selectedMilestone.projectId) }}</span>
              <span class="tabular-nums">{{ formatDate(selectedMilestone.dueDate) }}</span>
            </div>

            <!-- 回顾建议 -->
            <div v-if="selectedReviewNotifications.length" class="mb-5 space-y-2">
              <p class="text-body-sm font-medium text-foreground">AI 建议</p>
              <article v-for="notification in selectedReviewNotifications" :key="notification.id" class="rounded-lg border border-indigo-200/50 bg-indigo-50/40 p-3 dark:border-indigo-800/40 dark:bg-indigo-950/20">
                <div class="flex items-start gap-2.5">
                  <Sparkles class="mt-0.5 size-4 shrink-0 text-indigo-500" />
                  <div class="min-w-0 flex-1">
                    <p class="text-body-sm font-medium text-foreground">{{ notification.title }}</p>
                    <p class="mt-1 whitespace-pre-wrap text-caption leading-relaxed text-muted-foreground">{{ notification.body }}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <Button
                        v-for="action in notification.actions.filter((item) => item.id === 'accept_suggestion' || item.id === 'reject_suggestion')"
                        :key="action.id"
                        size="sm"
                        :variant="action.id === 'accept_suggestion' ? 'default' : 'outline'"
                        class="gap-1 text-caption"
                        :disabled="isReviewActionPending(notification, action.id)"
                        @click="handleReviewAction(notification, action.id)"
                      >
                        <CheckCircle2 v-if="action.id === 'accept_suggestion'" class="size-3" />
                        <CircleSlash2 v-else class="size-3" />
                        {{ action.label }}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div class="space-y-3">
              <div>
                <label class="mb-1 block text-micro font-medium text-muted-foreground">标题</label>
                <Input v-model="editMilestoneTitle" class="text-body-sm" placeholder="标题" :disabled="selectedMilestone.isSystem" />
              </div>
              <div>
                <label class="mb-1 block text-micro font-medium text-muted-foreground">目标</label>
                <Textarea v-model="editMilestoneGoal" class="min-h-16 text-body-sm" placeholder="目标" />
              </div>
              <div>
                <label class="mb-1 block text-micro font-medium text-muted-foreground">完成标准</label>
                <Textarea v-model="editMilestoneAcceptanceCriteria" class="min-h-16 text-body-sm" placeholder="完成标准" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">状态</label>
                  <Select v-model="editMilestoneStatus" :disabled="selectedMilestone.isSystem">
                    <SelectTrigger size="sm" class="text-body-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="column in statusColumns" :key="column.key" :value="column.key" :disabled="!canSelectStatus(selectedMilestone.status, column.key)">{{ column.label }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label class="mb-1 block text-micro font-medium text-muted-foreground">截止日期</label>
                  <Input v-model="editMilestoneDueDate" type="date" class="text-body-sm" />
                </div>
              </div>
              <div>
                <label class="mb-1 block text-micro font-medium text-muted-foreground">项目</label>
                <Select v-model="editMilestoneProjectId">
                  <SelectTrigger size="sm" class="text-body-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="opt in milestoneProjectOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="mt-6 flex gap-2">
              <Button size="sm" class="flex-1 text-body-sm" @click="saveSelectedMilestone">保存</Button>
              <Button v-if="!selectedMilestone.isSystem" variant="destructive" size="sm" class="px-3 text-body-sm" @click="pendingDeleteMilestone = selectedMilestone">
                <Trash2 class="size-3.5" />
              </Button>
            </div>

            <div class="mt-6">
              <p class="mb-2 text-body-sm font-semibold text-foreground">其下任务 ({{ selectedMilestoneTasks.length }})</p>
              <div class="space-y-1">
                <button v-for="task in selectedMilestoneTasks" :key="task.id" type="button" class="flex w-full items-center gap-2 rounded-md border border-subtle px-3 py-2 text-left text-body-sm text-foreground transition-colors hover:bg-soft" @click="openTask(task)">
                  <span class="size-1.5 rounded-full" :class="{
                    'bg-amber-400': task.status === 'pending',
                    'bg-sky-500': task.status === 'in_progress',
                    'bg-red-400': task.status === 'blocked',
                    'bg-purple-400': task.status === 'reviewing',
                    'bg-emerald-400': task.status === 'completed',
                  }"></span>
                  {{ task.title }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <AlertDialog :open="Boolean(pendingDeleteTask)" @update:open="(open) => { if (!open) pendingDeleteTask = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除任务</AlertDialogTitle>
          <AlertDialogDescription>确定删除“{{ pendingDeleteTask?.title }}”吗？该操作不能撤销。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="confirmDeleteTask">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(pendingDeleteMilestone)" @update:open="(open) => { if (!open) pendingDeleteMilestone = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除里程碑</AlertDialogTitle>
          <AlertDialogDescription>确定删除“{{ pendingDeleteMilestone?.title }}”吗？里程碑下存在任务时后端会拒绝删除。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="confirmDeleteMilestone">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
