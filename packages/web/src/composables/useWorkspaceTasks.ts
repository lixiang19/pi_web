import { type InjectionKey, computed, inject, provide, ref, watch } from "vue";
import { toast } from "vue-sonner";

import {
	type CheckboxTask,
	createWorkspaceTask,
	deleteWorkspaceTask,
	getCheckboxTasks,
	getWorkspaceTasks,
	toggleCheckbox,
	updateWorkspaceTask,
	type WorkspaceTask,
} from "@/lib/api";

export type AggregatedTask = {
	id: string;
	title: string;
	status: "pending" | "in_progress" | "done";
	priority: "low" | "medium" | "high";
	dueDate: number | null;
	tags: string;
	source:
		| { type: "independent" }
		| { type: "checkbox"; path: string; line: number; text: string };
	createdAt: number;
	updatedAt: number;
};

// Provide/Inject key for shared task store
export const WORKSPACE_TASKS_KEY: InjectionKey<ReturnType<typeof useWorkspaceTasksInner>> =
	Symbol("workspace-tasks");

export function provideWorkspaceTasks(workspaceDir: () => string) {
	const store = useWorkspaceTasksInner(workspaceDir);
	provide(WORKSPACE_TASKS_KEY, store);
	return store;
}

export function useWorkspaceTasks(workspaceDir?: () => string) {
	const injected = inject(WORKSPACE_TASKS_KEY, undefined);
	if (injected) return injected;
	// Fallback: create standalone instance (for backward compatibility)
	return useWorkspaceTasksInner(workspaceDir!);
}

function useWorkspaceTasksInner(workspaceDir: () => string) {
	const independentTasks = ref<WorkspaceTask[]>([]);
	const checkboxTasks = ref<CheckboxTask[]>([]);
	const isLoading = ref(false);
	const error = ref("");
	const showCompleted = ref(false);

	const load = async () => {
		const dir = workspaceDir();
		if (!dir) return;

		isLoading.value = true;
		error.value = "";
		try {
			const [taskRes, checkboxRes] = await Promise.all([
				getWorkspaceTasks(),
				getCheckboxTasks(dir),
			]);
			independentTasks.value = taskRes.tasks;
			checkboxTasks.value = checkboxRes.checkboxes;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			toast.error("加载任务失败", { description: error.value });
		} finally {
			isLoading.value = false;
		}
	};

	const allTasks = computed<AggregatedTask[]>(() => {
		const fromDb: AggregatedTask[] = independentTasks.value.map((t) => ({
			id: t.task_id,
			title: t.title,
			status: t.status,
			priority: t.priority,
			dueDate: t.due_date,
			tags: t.tags,
			source: { type: "independent" as const },
			createdAt: t.created_at,
			updatedAt: t.updated_at,
		}));

		const fromCheckbox: AggregatedTask[] = checkboxTasks.value.map((c) => ({
			// Stable ID: only (sourcePath, lineNumber), no array index
			id: `cb-${c.sourcePath}:${c.lineNumber}`,
			title: c.text,
			status: c.done ? ("done" as const) : ("pending" as const),
			priority: (c.priority || "medium") as AggregatedTask["priority"],
			dueDate: c.dueDate,
			tags: c.tags,
			source: {
				type: "checkbox" as const,
				path: c.sourcePath,
				line: c.lineNumber,
				text: c.text,
			},
			createdAt: c.createdAt ?? 0,
			updatedAt: c.updatedAt ?? 0,
		}));

		return [...fromDb, ...fromCheckbox].sort(
			(a, b) => b.updatedAt - a.updatedAt,
		);
	});

	const pendingTasks = computed(() =>
		allTasks.value.filter((t) => t.status !== "done"),
	);

	const completedTasks = computed(() =>
		allTasks.value.filter((t) => t.status === "done"),
	);

	const todayTasks = computed(() => {
		const now = new Date();
		const todayStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();
		const todayEnd = todayStart + 86400000;

		return allTasks.value.filter((t) => {
			if (t.status === "done") return false;
			if (t.dueDate && t.dueDate >= todayStart && t.dueDate < todayEnd)
				return true;
			if (t.createdAt >= todayStart && t.createdAt < todayEnd) return true;
			return false;
		});
	});

	// Task statistics
	const stats = computed(() => {
		const all = allTasks.value;
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
		tags?: string;
	}) => {
		try {
			const res = await createWorkspaceTask(data);
			// Optimistic insert: append to local list instead of full reload
			independentTasks.value.unshift(res.task);
			toast.success("任务已创建");
		} catch (err) {
			toast.error("创建任务失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const toggleStatus = async (task: AggregatedTask, newStatus: string) => {
		// Optimistic update: update local state immediately
		if (task.source.type === "checkbox") {
			const target = checkboxTasks.value.find(
				(c) => c.sourcePath === task.source.path && c.lineNumber === task.source.line,
			);
			if (target) target.done = newStatus === "done";
		} else {
			const target = independentTasks.value.find((t) => t.task_id === task.id);
			if (target) {
				target.status = newStatus as AggregatedTask["status"];
				target.updated_at = Date.now();
			}
		}

		try {
			if (task.source.type === "checkbox" && task.source.path) {
				// checkbox 来源：回写 .md 文件，带 expectedText 校验
				await toggleCheckbox({
					path: task.source.path,
					lineNumber: task.source.line,
					done: newStatus === "done",
					expectedText: task.source.text,
				});
			} else {
				// 独立任务：更新 DB
				await updateWorkspaceTask(task.id, { status: newStatus });
			}
		} catch (err) {
			// Rollback on failure
			if (task.source.type === "checkbox") {
				const target = checkboxTasks.value.find(
					(c) => c.sourcePath === task.source.path && c.lineNumber === task.source.line,
				);
				if (target) target.done = !target.done;
			} else {
				const target = independentTasks.value.find((t) => t.task_id === task.id);
				if (target) {
					target.status = task.status;
					target.updated_at = task.updatedAt;
				}
			}

			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("409") || message.includes("Conflict")) {
				toast.warning("文件已被修改，正在重新加载", { description: "该行内容已变化" });
				await load();
			} else {
				toast.error("切换状态失败", { description: message });
			}
		}
	};

	const removeTask = async (taskId: string) => {
		// Optimistic: remove from local list immediately
		const prev = [...independentTasks.value];
		independentTasks.value = independentTasks.value.filter(
			(t) => t.task_id !== taskId,
		);

		try {
			await deleteWorkspaceTask(taskId);
			toast.success("任务已删除");
		} catch (err) {
			// Rollback
			independentTasks.value = prev;
			toast.error("删除任务失败", {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	};

	const updateTask = async (
		taskId: string,
		data: {
			title?: string;
			priority?: string;
			dueDate?: number;
			tags?: string;
		},
	) => {
		// Optimistic
		const target = independentTasks.value.find((t) => t.task_id === taskId);
		const prev = target ? { ...target } : null;
		if (target) {
			if (data.title !== undefined) target.title = data.title;
			if (data.priority !== undefined) target.priority = data.priority as WorkspaceTask["priority"];
			if (data.dueDate !== undefined) target.due_date = data.dueDate;
			if (data.tags !== undefined) target.tags = data.tags;
			target.updated_at = Date.now();
		}

		try {
			await updateWorkspaceTask(taskId, data);
			toast.success("任务已更新");
		} catch (err) {
			// Rollback
			if (prev && target) {
				Object.assign(target, prev);
			}
			toast.error("更新任务失败", {
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

	return {
		allTasks,
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
	};
}
