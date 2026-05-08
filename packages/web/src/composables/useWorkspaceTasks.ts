import { computed, type InjectionKey, inject, provide, ref, watch } from "vue";
import { toast } from "vue-sonner";

import {
	createWorkspaceTask,
	deleteWorkspaceTask,
	getWorkspaceTasks,
	reorderWorkspaceTasks,
	updateWorkspaceTask,
} from "@/lib/api";

export type TaskItem = {
	id: string;
	title: string;
	status: "pending" | "in_progress" | "done";
	priority: "low" | "medium" | "high";
	dueDate: number | null;
	tags: string[];
	order?: number;
	createdAt: number;
	updatedAt: number;
	kind?: "goal" | "task";
	sessionId?: string;
	source?: "dashboard";
};

// Provide/Inject key for shared task store
export const WORKSPACE_TASKS_KEY: InjectionKey<
	ReturnType<typeof useWorkspaceTasksInner>
> = Symbol("workspace-tasks");

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
	const updatedAt = ref(0);
	const isLoading = ref(false);
	const error = ref("");
	const showCompleted = ref(false);
	const searchQuery = ref("");
	const filterStatus = ref<"all" | "pending" | "in_progress" | "done">("all");
	const filterPriority = ref<"all" | "high" | "medium" | "low">("all");
	const filterTags = ref<string[]>([]);

	const load = async () => {
		const dir = workspaceDir();
		if (!dir) return;

		isLoading.value = true;
		error.value = "";
		try {
			const res = await getWorkspaceTasks();
			tasks.value = res.tasks as TaskItem[];
			updatedAt.value = res.updatedAt;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			toast.error("加载任务失败", { description: error.value });
		} finally {
			isLoading.value = false;
		}
	};

	const allTags = computed(() => {
		const tags = new Set<string>();
		for (const t of tasks.value) {
			for (const tag of t.tags) {
				tags.add(tag);
			}
		}
		return Array.from(tags).sort();
	});

	const filteredTasks = computed(() => {
		return tasks.value
			.filter((task) => {
				if (
					searchQuery.value &&
					!task.title.toLowerCase().includes(searchQuery.value.toLowerCase())
				) {
					return false;
				}
				if (
					filterStatus.value !== "all" &&
					task.status !== filterStatus.value
				) {
					return false;
				}
				if (
					filterPriority.value !== "all" &&
					task.priority !== filterPriority.value
				) {
					return false;
				}
				if (
					filterTags.value.length > 0 &&
					!filterTags.value.some((tag) => task.tags.includes(tag))
				) {
					return false;
				}
				return true;
			})
			.sort((a, b) => {
				if (a.order !== undefined && b.order !== undefined)
					return a.order - b.order;
				if (a.order !== undefined) return -1;
				if (b.order !== undefined) return 1;
				return b.createdAt - a.createdAt;
			});
	});

	const hasActiveFilters = computed(
		() =>
			searchQuery.value !== "" ||
			filterStatus.value !== "all" ||
			filterPriority.value !== "all" ||
			filterTags.value.length > 0,
	);

	const resetFilters = () => {
		searchQuery.value = "";
		filterStatus.value = "all";
		filterPriority.value = "all";
		filterTags.value = [];
	};

	const pendingTasks = computed(() =>
		filteredTasks.value.filter((t) => t.status !== "done"),
	);

	const completedTasks = computed(() =>
		filteredTasks.value.filter((t) => t.status === "done"),
	);

	const todayTasks = computed(() => {
		const now = new Date();
		const todayStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();
		const todayEnd = todayStart + 86400000;

		return filteredTasks.value.filter((t) => {
			if (t.status === "done") return false;
			if (t.dueDate && t.dueDate >= todayStart && t.dueDate < todayEnd)
				return true;
			if (t.createdAt >= todayStart && t.createdAt < todayEnd) return true;
			return false;
		});
	});

	const stats = computed(() => {
		const all = tasks.value;
		return {
			pending: all.filter((t) => t.status === "pending").length,
			inProgress: all.filter((t) => t.status === "in_progress").length,
			done: all.filter((t) => t.status === "done").length,
			total: all.length,
		};
	});

	const addTask = async (data: {
		title: string;
		priority?: string;
		dueDate?: number;
		tags?: string[];
		kind?: "goal" | "task";
		sessionId?: string;
		source?: "dashboard";
	}) => {
		try {
			const res = await createWorkspaceTask({
				...data,
				_expectedUpdatedAt: updatedAt.value || undefined,
			});
			tasks.value.unshift(res.task as TaskItem);
			updatedAt.value = res.updatedAt;
			toast.success("任务已创建");
			return res.task as TaskItem;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("409")) {
				toast.warning("任务已被修改，正在重新加载");
				await load();
			} else {
				toast.error("创建任务失败", { description: message });
			}
			throw err;
		}
	};

	const toggleStatus = async (task: TaskItem, newStatus: string) => {
		const prev = { ...task };
		// Optimistic update
		task.status = newStatus as TaskItem["status"];
		task.updatedAt = Date.now();

		try {
			const res = await updateWorkspaceTask(task.id, {
				status: newStatus,
				_expectedUpdatedAt: updatedAt.value,
			});
			updatedAt.value = res.updatedAt;
		} catch (err) {
			// Rollback
			Object.assign(task, prev);
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("409")) {
				toast.warning("任务已被修改，正在重新加载");
				await load();
			} else {
				toast.error("切换状态失败", { description: message });
			}
		}
	};

	const removeTask = async (taskId: string) => {
		const prev = [...tasks.value];
		tasks.value = tasks.value.filter((t) => t.id !== taskId);

		try {
			const res = await deleteWorkspaceTask(taskId, updatedAt.value);
			updatedAt.value = res.updatedAt;
			toast.success("任务已删除");
		} catch (err) {
			tasks.value = prev;
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("409")) {
				toast.warning("任务已被修改，正在重新加载");
				await load();
			} else {
				toast.error("删除任务失败", { description: message });
			}
		}
	};

	const updateTask = async (
		taskId: string,
		data: {
			title?: string;
			priority?: string;
			dueDate?: number | null;
			tags?: string[];
			kind?: "goal" | "task";
			sessionId?: string;
			source?: "dashboard";
		},
	) => {
		const target = tasks.value.find((t) => t.id === taskId);
		const prev = target ? { ...target } : null;
		if (target) {
			if (data.title !== undefined) target.title = data.title;
			if (data.priority !== undefined)
				target.priority = data.priority as TaskItem["priority"];
			if (data.dueDate !== undefined) target.dueDate = data.dueDate;
			if (data.tags !== undefined) target.tags = data.tags;
			if (data.kind !== undefined) target.kind = data.kind;
			if (data.sessionId !== undefined) target.sessionId = data.sessionId;
			if (data.source !== undefined) target.source = data.source;
			target.updatedAt = Date.now();
		}

		try {
			const res = await updateWorkspaceTask(taskId, {
				...data,
				_expectedUpdatedAt: updatedAt.value,
			});
			updatedAt.value = res.updatedAt;
			toast.success("任务已更新");
		} catch (err) {
			if (prev && target) {
				Object.assign(target, prev);
			}
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("409")) {
				toast.warning("任务已被修改，正在重新加载");
				await load();
			} else {
				toast.error("更新任务失败", { description: message });
			}
		}
	};

	const reorderTasks = async (
		items: Array<{ id: string; order: number; status?: string }>,
	) => {
		// Optimistic update
		const prev = tasks.value.map((t) => ({ ...t }));
		for (const item of items) {
			const task = tasks.value.find((t) => t.id === item.id);
			if (task) {
				task.order = item.order;
				if (item.status !== undefined)
					task.status = item.status as TaskItem["status"];
				task.updatedAt = Date.now();
			}
		}

		try {
			const res = await reorderWorkspaceTasks(items, updatedAt.value);
			updatedAt.value = res.updatedAt;
		} catch (err) {
			tasks.value = prev;
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("409")) {
				toast.warning("任务已被修改，正在重新加载");
				await load();
			} else {
				toast.error("排序失败", { description: message });
			}
		}
	};

	watch(
		() => workspaceDir(),
		(dir) => {
			if (dir) load();
		},
		{ immediate: true },
	);

	return {
		tasks,
		searchQuery,
		filterStatus,
		filterPriority,
		filterTags,
		allTags,
		filteredTasks,
		hasActiveFilters,
		resetFilters,
		pendingTasks,
		completedTasks,
		todayTasks,
		stats,
		isLoading,
		error,
		showCompleted,
		load,
		addTask,
		toggleStatus,
		removeTask,
		updateTask,
		reorderTasks,
	};
}
