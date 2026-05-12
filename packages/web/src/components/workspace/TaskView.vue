<script setup lang="ts">
import { computed, ref } from "vue";
import {
	CalendarDays,
	LoaderCircle,
	Plus,
	Trash2,
} from "lucide-vue-next";

import {
	useWorkspaceTasks,
	type MilestoneItem,
	type TaskItem,
} from "@/composables/useWorkspaceTasks";
import { useProjects } from "@/composables/useProjects";
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
import type { WorkspaceTaskPriority, WorkspaceTaskStatus } from "@/lib/api";

const emit = defineEmits<{ openSession: [sessionId: string] }>();

defineProps<{ workspaceDir: string }>();

const {
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
} = useWorkspaceTasks();

const { projects, load: loadProjects } = useProjects();

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
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-4 py-3">
        <div>
          <h2 class="text-sm font-semibold">任务</h2>
          <p class="text-[11px] text-muted-foreground">
            待处理 {{ stats.pending }} · 进行中 {{ stats.inProgress }} · 阻塞 {{ stats.blocked }} · 审核中 {{ stats.reviewing }} · 完成 {{ stats.done }}
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span class="text-xs text-muted-foreground">项目筛选</span>
          <Select :model-value="projectFilter === undefined ? '__all__' : projectFilter === null ? '__none__' : projectFilter" @update:model-value="handleProjectFilterChange">
            <SelectTrigger class="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in filterProjectOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
            </SelectContent>
          </Select>
          <Input v-model="newTaskTitle" class="h-8 w-40 text-xs" placeholder="任务标题" @keydown.enter="handleAddTask" />
          <Input v-model="newTaskAcceptanceCriteria" class="h-8 w-52 text-xs" placeholder="完成标准（必填）" @keydown.enter="handleAddTask" />
          <Select v-model="newTaskPriority">
            <SelectTrigger class="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">普通</SelectItem>
              <SelectItem value="important">重要</SelectItem>
              <SelectItem value="urgent">紧急</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="newTaskMilestoneId">
            <SelectTrigger class="h-8 w-32 text-xs"><SelectValue placeholder="里程碑" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="milestone in milestones" :key="milestone.id" :value="milestone.id">
                {{ milestone.title }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="newTaskProjectId">
            <SelectTrigger class="h-8 w-32 text-xs"><SelectValue placeholder="项目" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in taskProjectOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
            </SelectContent>
          </Select>
          <Input v-model="newTaskDueDate" type="date" class="h-8 w-32 text-xs" />
          <Button size="sm" class="h-8 gap-1 text-xs" :disabled="!newTaskTitle.trim() || !newTaskAcceptanceCriteria.trim()" @click="handleAddTask">
            <Plus class="size-3" />新建任务
          </Button>
        </div>
      </div>

      <Tabs v-model="viewMode" class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="shrink-0 px-4 pt-3">
          <TabsList class="grid h-8 w-[360px] grid-cols-4">
            <TabsTrigger value="kanban" class="text-xs">看板</TabsTrigger>
            <TabsTrigger value="list" class="text-xs">列表</TabsTrigger>
            <TabsTrigger value="calendar" class="text-xs">日历</TabsTrigger>
            <TabsTrigger value="milestones" class="text-xs">里程碑</TabsTrigger>
          </TabsList>
        </div>

        <div v-if="isLoading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle class="size-4 animate-spin" />加载中...
        </div>

        <TabsContent v-else value="kanban" class="m-0 min-h-0 flex-1 overflow-auto p-4">
          <div class="mb-3 flex items-center gap-2">
            <span class="text-xs text-muted-foreground">里程碑筛选</span>
            <Select v-model="kanbanMilestoneFilter">
              <SelectTrigger class="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部里程碑</SelectItem>
                <SelectItem v-for="milestone in milestones" :key="milestone.id" :value="milestone.id">
                  {{ milestone.title }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex min-w-[980px] gap-3">
            <section
              v-for="column in statusColumns"
              :key="column.key"
              class="min-h-[420px] flex-1 rounded-xl border border-border/50 bg-muted/20 p-3"
              @dragover.prevent
              @drop="handleDropOnStatus(column.key)"
            >
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-xs font-semibold">{{ column.label }}</h3>
                <span class="text-[11px] text-muted-foreground">{{ filteredTasksByStatus[column.key].length }}</span>
              </div>
              <div class="space-y-2">
                <button
                  v-for="task in filteredTasksByStatus[column.key]"
                  :key="task.id"
                  type="button"
                  draggable="true"
                  class="w-full cursor-grab rounded-lg border border-border/50 bg-card p-3 text-left shadow-sm hover:bg-accent/30 active:cursor-grabbing"
                  :style="{ borderLeftColor: milestoneColor(task.milestoneId ?? ''), borderLeftWidth: '4px' }"
                  @dragstart="draggedTask = task"
                  @dragover.prevent
                  @drop.stop="handleDropOnTask(task)"
                  @click="openTask(task)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-xs font-medium">{{ task.title }}</p>
                    <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ priorityLabel(task.priority) }}</span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{{ task.acceptanceCriteria }}</p>
                  <p class="mt-1 text-[10px] text-muted-foreground">{{ projectName(task.projectId) }}</p>
                  <p class="mt-2 text-[10px] text-muted-foreground">{{ formatDate(task.dueDate) }}</p>
                </button>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="list" class="m-0 min-h-0 flex-1 overflow-auto p-4">
          <section v-for="group in tasksByMilestone" :key="group.milestone.id" class="mb-5">
            <button type="button" class="mb-2 text-left text-xs font-semibold hover:text-primary" @click="openMilestone(group.milestone)">
              {{ group.milestone.title }} · {{ group.tasks.length }}
            </button>
            <div class="overflow-hidden rounded-xl border border-border/50">
              <button v-for="task in group.tasks" :key="task.id" type="button" class="flex w-full items-center gap-3 border-b border-border/30 px-3 py-2 text-left last:border-b-0 hover:bg-accent/30" @click="openTask(task)">
                <span class="w-16 text-[11px] text-muted-foreground">{{ priorityLabel(task.priority) }}</span>
                <span class="w-20 text-[11px] text-muted-foreground">{{ statusLabel(task.status) }}</span>
                <span class="min-w-0 flex-1 text-sm">{{ task.title }}</span>
                <span class="w-24 text-[11px] text-muted-foreground">{{ projectName(task.projectId) }}</span>
                <span class="text-[11px] text-muted-foreground">{{ formatDate(task.dueDate) }}</span>
              </button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="calendar" class="m-0 min-h-0 flex-1 overflow-auto p-4">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-sm font-semibold"><CalendarDays class="size-4" />{{ monthTitle }}</h3>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" class="h-7 text-xs" @click="changeMonth(-1)">上月</Button>
              <Button variant="outline" size="sm" class="h-7 text-xs" @click="changeMonth(1)">下月</Button>
            </div>
          </div>
          <div class="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div class="overflow-hidden rounded-xl border border-border/50">
              <div class="grid grid-cols-7 border-b border-border/40 bg-muted/30">
                <div v-for="label in weekLabels" :key="label" class="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">{{ label }}</div>
              </div>
              <div class="grid grid-cols-7">
                <div v-for="cell in calendarCells" :key="cell.key" class="min-h-28 border-b border-r border-border/30 p-2 last:border-r-0" :class="cell.isCurrentMonth ? 'bg-background' : 'bg-muted/20 text-muted-foreground'">
                  <p class="mb-1 text-[11px] font-medium">{{ cell.date.getDate() }}</p>
                  <button v-for="task in cell.tasks" :key="task.id" type="button" class="mb-1 block w-full rounded px-1.5 py-1 text-left text-[11px] hover:opacity-80" :style="{ backgroundColor: `${milestoneColor(task.milestoneId ?? '')}22`, borderLeft: `3px solid ${milestoneColor(task.milestoneId ?? '')}` }" @click="openTask(task)">
                    {{ task.title }}
                  </button>
                </div>
              </div>
            </div>
            <aside class="rounded-xl border border-border/50 p-4">
              <h3 class="mb-3 text-xs font-semibold">无截止日期</h3>
              <button v-for="task in undatedTasks" :key="task.id" type="button" class="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent/40" @click="openTask(task)">
                {{ task.title }}
              </button>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="milestones" class="m-0 min-h-0 flex-1 overflow-auto p-4">
          <div class="mb-4 grid gap-2 rounded-xl border border-border/50 p-3 md:grid-cols-[160px_1fr_1fr_130px_140px_auto]">
            <Input v-model="newMilestoneTitle" class="h-8 text-xs" placeholder="里程碑标题" />
            <Input v-model="newMilestoneGoal" class="h-8 text-xs" placeholder="目标" />
            <Input v-model="newMilestoneAcceptanceCriteria" class="h-8 text-xs" placeholder="完成标准" />
            <Input v-model="newMilestoneDueDate" type="date" class="h-8 text-xs" />
            <Select v-model="newMilestoneProjectId">
              <SelectTrigger class="h-8 text-xs"><SelectValue placeholder="项目" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in milestoneProjectOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" class="h-8 text-xs" :disabled="!newMilestoneTitle.trim() || !newMilestoneGoal.trim() || !newMilestoneAcceptanceCriteria.trim()" @click="handleAddMilestone">新建里程碑</Button>
          </div>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article v-for="milestone in milestones" :key="milestone.id" class="rounded-xl border border-border/50 bg-card p-4">
              <button type="button" class="block w-full text-left" @click="openMilestone(milestone)">
                <h3 class="text-sm font-semibold">{{ milestone.title }}</h3>
                <p class="mt-1 text-[11px] text-muted-foreground">{{ statusLabel(milestone.status) }} · {{ milestone.taskCount }} 个任务 · {{ formatDate(milestone.dueDate) }}</p>
                <p class="mt-1 text-[10px] text-muted-foreground">{{ projectName(milestone.projectId) }}</p>
                <p class="mt-3 text-xs text-muted-foreground">目标：{{ milestone.goal }}</p>
                <p class="mt-1 text-xs text-muted-foreground">完成标准：{{ milestone.acceptanceCriteria }}</p>
              </button>
            </article>
          </div>
        </TabsContent>
      </Tabs>
    </div>

    <Sheet :open="detailOpen" @update:open="(open) => { if (!open) closeDetail() }">
      <SheetContent class="w-96 overflow-auto p-4 sm:max-w-96">
      <div v-if="selectedTask" class="space-y-4">
        <SheetHeader>
          <SheetTitle class="text-base">{{ selectedTask.title }}</SheetTitle>
        </SheetHeader>
        <div class="space-y-3">
          <Input v-model="editTaskTitle" class="h-8 text-xs" placeholder="标题" />
          <Textarea v-model="editTaskAcceptanceCriteria" class="min-h-24 text-xs" placeholder="完成标准" />
          <Select v-model="editTaskStatus">
            <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="column in statusColumns" :key="column.key" :value="column.key" :disabled="!canSelectStatus(selectedTask.status, column.key)">{{ column.label }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="editTaskPriority">
            <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">普通</SelectItem>
              <SelectItem value="important">重要</SelectItem>
              <SelectItem value="urgent">紧急</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="editTaskMilestoneId">
            <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="milestone in milestones" :key="milestone.id" :value="milestone.id">{{ milestone.title }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="editTaskProjectId">
            <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in taskProjectOptions.filter(o => o.id !== '__inherit__')" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
            </SelectContent>
          </Select>
          <Input v-model="editTaskDueDate" type="date" class="h-8 text-xs" />
          <Textarea v-model="editTaskBlockedReason" class="min-h-16 text-xs" placeholder="阻塞原因（可选）" />
        </div>
        <p class="text-[11px] text-muted-foreground">当前里程碑：{{ selectedTaskMilestone?.title ?? '未知' }} · 项目：{{ projectName(selectedTask.projectId) }}</p>
        <div class="flex gap-2">
          <Button size="sm" class="h-8 flex-1 text-xs" @click="saveSelectedTask">保存</Button>
          <Button
            size="sm"
            class="h-8 flex-1 text-xs"
            @click="handleOpenProcessingSession"
          >
            {{ selectedTask.processingSessionId ? '继续处理' : '开始处理' }}
          </Button>
          <Button variant="destructive" size="sm" class="h-8 text-xs" @click="pendingDeleteTask = selectedTask">
            <Trash2 class="mr-1 size-3" />删除
          </Button>
        </div>
      </div>

      <div v-else-if="selectedMilestone" class="space-y-4">
        <SheetHeader>
          <SheetTitle class="text-base">{{ selectedMilestone.title }}</SheetTitle>
        </SheetHeader>
        <div class="space-y-3">
          <Input v-model="editMilestoneTitle" class="h-8 text-xs" placeholder="标题" :disabled="selectedMilestone.isSystem" />
          <Textarea v-model="editMilestoneGoal" class="min-h-20 text-xs" placeholder="目标" />
          <Textarea v-model="editMilestoneAcceptanceCriteria" class="min-h-20 text-xs" placeholder="完成标准" />
          <Select v-model="editMilestoneStatus" :disabled="selectedMilestone.isSystem">
            <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="column in statusColumns" :key="column.key" :value="column.key" :disabled="!canSelectStatus(selectedMilestone.status, column.key)">{{ column.label }}</SelectItem>
            </SelectContent>
          </Select>
          <Input v-model="editMilestoneDueDate" type="date" class="h-8 text-xs" />
          <Select v-model="editMilestoneProjectId">
            <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in milestoneProjectOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex gap-2">
          <Button size="sm" class="h-8 flex-1 text-xs" @click="saveSelectedMilestone">保存</Button>
          <Button v-if="!selectedMilestone.isSystem" variant="destructive" size="sm" class="h-8 text-xs" @click="pendingDeleteMilestone = selectedMilestone">删除</Button>
        </div>
        <div>
          <p class="mb-2 text-xs font-medium">其下任务</p>
          <button v-for="task in selectedMilestoneTasks" :key="task.id" type="button" class="mb-1 block w-full rounded border border-border/40 px-2 py-1.5 text-left text-xs hover:bg-accent/40" @click="openTask(task)">
            {{ task.title }} · {{ statusLabel(task.status) }}
          </button>
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
