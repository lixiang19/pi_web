import { computed, type InjectionKey, inject, provide, ref, watch } from "vue";
import { toast } from "vue-sonner";

import {
	createWorkspaceMilestone,
	createWorkspaceTask,
	deleteWorkspaceMilestone,
	deleteWorkspaceTask,
	getWorkspaceMilestones,
	getWorkspaceTasks,
	updateWorkspaceMilestone,
	updateWorkspaceTask,
	type WorkspaceMilestone,
	type WorkspaceTask,
	type WorkspaceTaskPriority,
	type WorkspaceTaskStatus,
} from "@/lib/api";

export type TaskItem = Omit<
	WorkspaceTask,
	| "workspacePath"
	| "milestoneId"
	| "acceptanceCriteria"
	| "blockedReason"
	| "processingSessionId"
	| "sortOrder"
> &
	Partial<
		Pick<
			WorkspaceTask,
			| "workspacePath"
			| "milestoneId"
			| "acceptanceCriteria"
			| "blockedReason"
			| "processingSessionId"
			| "sortOrder"
		>
	>;
export type MilestoneItem = WorkspaceMilestone;

export const WORKSPACE_TASKS_KEY: InjectionKey<
	ReturnType<typeof useWorkspaceTasksInner>
> = Symbol("workspace-tasks");

const statusOrder: WorkspaceTaskStatus[] = [
	"pending",
	"in_progress",
	"blocked",
	"reviewing",
	"completed",
];

const priorityWeight: Record<WorkspaceTaskPriority, number> = {
	urgent: 0,
	high: 0,
	important: 1,
	medium: 1,
	normal: 2,
	low: 2,
};

export function provideWorkspaceTasks(workspaceDir: () => string) {
	const store = useWorkspaceTasksInner(workspaceDir);
	provide(WORKSPACE_TASKS_KEY, store);
	return store;
}

export function useWorkspaceTasks(workspaceDir?: () => string) {
	const injected = inject(WORKSPACE_TASKS_KEY, undefined);
	if (injected) return injected;
	return useWorkspaceTasksInner(workspaceDir!);
}

function useWorkspaceTasksInner(workspaceDir: () => string) {
	const tasks = ref<TaskItem[]>([]);
	const milestones = ref<MilestoneItem[]>([]);
	const isLoading = ref(false);
	const error = ref("");
	const showCompleted = ref(false);
	const projectFilter = ref<string | null | undefined>(undefined);

	const load = async () => {
		const dir = workspaceDir();
		if (!dir) return;

		isLoading.value = true;
		error.value = "";
		try {
			const [tasksRes, milestonesRes] = await Promise.all([
				getWorkspaceTasks(projectFilter.value),
				getWorkspaceMilestones(),
			]);
			tasks.value = tasksRes.tasks;
			milestones.value = milestonesRes.milestones;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			toast.error("加载任务系统失败", { description: error.value });
		} finally {
			isLoading.value = false;
		}
	};

	const pendingTasks = computed(() =>
		tasks.value.filter((task) => task.status !== "completed"),
	);

	const completedTasks = computed(() =>
		tasks.value.filter((task) => task.status === "completed"),
	);

	const todayTasks = computed(() => {
		const now = new Date();
		const todayStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();
		const todayEnd = todayStart + 86400000;

		return tasks.value.filter((task) => {
			if (task.status === "completed") return false;
			if (task.dueDate && task.dueDate >= todayStart && task.dueDate < todayEnd) {
				return true;
			}
			return task.createdAt >= todayStart && task.createdAt < todayEnd;
		});
	});

	const stats = computed(() => ({
		pending: tasks.value.filter((task) => task.status === "pending").length,
		inProgress: tasks.value.filter((task) => task.status === "in_progress").length,
		blocked: tasks.value.filter((task) => task.status === "blocked").length,
		reviewing: tasks.value.filter((task) => task.status === "reviewing").length,
		done: completedTasks.value.length,
		total: tasks.value.length,
	}));

	const tasksByStatus = computed(() =>
		Object.fromEntries(
			statusOrder.map((status) => [
				status,
				tasks.value
					.filter((task) => task.status === status)
					.sort(
						(a, b) =>
							(a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
							a.createdAt - b.createdAt,
					),
			]),
		) as Record<WorkspaceTaskStatus, TaskItem[]>,
	);

	const tasksByMilestone = computed(() =>
		milestones.value.map((milestone) => ({
			milestone,
			tasks: tasks.value
				.filter((task) => task.milestoneId === milestone.id)
				.sort(sortTasksForList),
		})),
	);

	const calendarTasks = computed(() => {
		const byDate = new Map<string, TaskItem[]>();
		const withoutDueDate: TaskItem[] = [];
		for (const task of tasks.value) {
			if (!task.dueDate) {
				withoutDueDate.push(task);
				continue;
			}
			const key = new Date(task.dueDate).toISOString().slice(0, 10);
			byDate.set(key, [...(byDate.get(key) ?? []), task]);
		}
		return { byDate, withoutDueDate };
	});

	const addTask = async (data: {
		title: string;
		priority: WorkspaceTaskPriority;
		acceptanceCriteria: string;
		dueDate?: number | null;
		milestoneId?: string | null;
		projectId?: string | null;
	}) => {
		try {
			const res = await createWorkspaceTask(data);
			tasks.value.unshift(res.task);
			await load();
			toast.success("任务已创建");
		} catch (err) {
			toast.error("创建任务失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const addMilestone = async (data: {
		title: string;
		goal: string;
		acceptanceCriteria: string;
		dueDate?: number | null;
		projectId?: string | null;
	}) => {
		try {
			const res = await createWorkspaceMilestone(data);
			milestones.value.push(res.milestone);
			toast.success("里程碑已创建");
		} catch (err) {
			toast.error("创建里程碑失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const toggleStatus = async (task: TaskItem, newStatus: WorkspaceTaskStatus) => {
		const previous = { ...task };
		task.status = newStatus;
		task.updatedAt = Date.now();
		try {
			const res = await updateWorkspaceTask(task.id, {
				status: newStatus,
				actor: "user",
			});
			Object.assign(task, res.task);
		} catch (err) {
			Object.assign(task, previous);
			toast.error("切换状态失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const removeTask = async (taskId: string) => {
		const previous = [...tasks.value];
		tasks.value = tasks.value.filter((task) => task.id !== taskId);
		try {
			await deleteWorkspaceTask(taskId);
			await load();
			toast.success("任务已删除");
		} catch (err) {
			tasks.value = previous;
			toast.error("删除任务失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const updateTask = async (
		taskId: string,
		data: Parameters<typeof updateWorkspaceTask>[1],
	) => {
		const target = tasks.value.find((task) => task.id === taskId);
		const previous = target ? { ...target } : null;
		if (target) Object.assign(target, data, { updatedAt: Date.now() });
		try {
			const res = await updateWorkspaceTask(taskId, data);
			if (target) Object.assign(target, res.task);
			await load();
			toast.success("任务已更新");
		} catch (err) {
			if (target && previous) Object.assign(target, previous);
			toast.error("更新任务失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const updateMilestone = async (
		milestoneId: string,
		data: Parameters<typeof updateWorkspaceMilestone>[1],
	) => {
		try {
			const res = await updateWorkspaceMilestone(milestoneId, data);
			const index = milestones.value.findIndex(
				(milestone) => milestone.id === milestoneId,
			);
			if (index >= 0) milestones.value[index] = res.milestone;
			toast.success("里程碑已更新");
		} catch (err) {
			toast.error("更新里程碑失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const removeMilestone = async (milestoneId: string) => {
		try {
			await deleteWorkspaceMilestone(milestoneId);
			await load();
			toast.success("里程碑已删除");
		} catch (err) {
			toast.error("删除里程碑失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	watch(
		() => workspaceDir(),
		(dir) => {
			if (dir) load();
		},
		{ immediate: true },
	);

	watch(
		projectFilter,
		() => load(),
	);

	return {
		tasks,
		milestones,
		pendingTasks,
		completedTasks,
		todayTasks,
		stats,
		tasksByStatus,
		tasksByMilestone,
		calendarTasks,
		isLoading,
		error,
		showCompleted,
		projectFilter,
		load,
		addTask,
		addMilestone,
		toggleStatus,
		removeTask,
		updateTask,
		updateMilestone,
		removeMilestone,
	};
}

function sortTasksForList(a: TaskItem, b: TaskItem) {
	const priorityDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
	if (priorityDiff !== 0) return priorityDiff;
	if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
	if (a.dueDate) return -1;
	if (b.dueDate) return 1;
	return a.createdAt - b.createdAt;
}
