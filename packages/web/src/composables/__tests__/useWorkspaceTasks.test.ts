import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTasks } from "@/composables/useWorkspaceTasks";

vi.mock("@/lib/api", () => ({
	getWorkspaceTasks: vi.fn(),
	createWorkspaceTask: vi.fn(),
	updateWorkspaceTask: vi.fn(),
	deleteWorkspaceTask: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	},
}));

import type { WorkspaceTask } from "@/lib/api";
import {
	createWorkspaceTask,
	deleteWorkspaceTask,
	getWorkspaceTasks,
	updateWorkspaceTask,
} from "@/lib/api";

const mockGetWorkspaceTasks = vi.mocked(getWorkspaceTasks);
const mockCreateWorkspaceTask = vi.mocked(createWorkspaceTask);
const mockUpdateWorkspaceTask = vi.mocked(updateWorkspaceTask);
const mockDeleteWorkspaceTask = vi.mocked(deleteWorkspaceTask);

function makeTask(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
	const now = Date.now();
	return {
		id: "task-1",
		title: "Test task",
		status: "pending",
		priority: "medium",
		dueDate: null,
		tags: [],
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

describe("useWorkspaceTasks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── load ────────────────────────────────────────────────────

	it("load() → 调用 API 并设置 tasks", async () => {
		const tasks = [
			makeTask({ id: "1", title: "Task 1" }),
			makeTask({ id: "2", title: "Task 2", status: "done" }),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: 1000 });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.tasks.value).toEqual(tasks);
	});

	it("load() → API 失败时 tasks 为空数组", async () => {
		mockGetWorkspaceTasks.mockRejectedValue(new Error("network error"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.tasks.value).toEqual([]);
		expect(store.error.value).toBe("network error");
	});

	// ── computed ────────────────────────────────────────────────

	it("pendingTasks → 只含 status≠done", async () => {
		const tasks = [
			makeTask({ id: "1", status: "pending" }),
			makeTask({ id: "2", status: "in_progress" }),
			makeTask({ id: "3", status: "done" }),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: Date.now() });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.pendingTasks.value).toHaveLength(2);
		expect(store.pendingTasks.value.every((t) => t.status !== "done")).toBe(
			true,
		);
	});

	it("completedTasks → 只含 status=done", async () => {
		const tasks = [
			makeTask({ id: "1", status: "pending" }),
			makeTask({ id: "2", status: "done" }),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: Date.now() });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.completedTasks.value).toHaveLength(1);
		expect(store.completedTasks.value[0]!.id).toBe("2");
	});

	it("todayTasks → 今天 dueDate 或 createdAt 的，排除 done", async () => {
		const todayStart = new Date(
			new Date().getFullYear(),
			new Date().getMonth(),
			new Date().getDate(),
		).getTime();
		const todayEnd = todayStart + 86_400_000;

		const tasks = [
			makeTask({
				id: "1",
				title: "Due today",
				dueDate: todayStart + 10_000,
			}),
			makeTask({
				id: "2",
				title: "Created today",
				createdAt: todayStart + 20_000,
			}),
			makeTask({
				id: "3",
				title: "Done today",
				dueDate: todayStart + 30_000,
				status: "done",
			}),
			makeTask({
				id: "4",
				title: "Future",
				dueDate: todayEnd + 100_000,
				createdAt: todayStart - 86_400_000,
			}),
			makeTask({
				id: "5",
				title: "Old",
				createdAt: todayStart - 86_400_000,
			}),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: Date.now() });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.todayTasks.value).toHaveLength(2);
		expect(store.todayTasks.value.map((t) => t.id).sort()).toEqual(["1", "2"]);
	});

	it("todayTasks → dueDate=null 且 createdAt 非今天的不含", async () => {
		const yesterday = Date.now() - 86_400_000 * 2;
		const tasks = [
			makeTask({ id: "1", dueDate: null, createdAt: yesterday }),
			makeTask({
				id: "2",
				dueDate: null,
				createdAt: yesterday,
				status: "done",
			}),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: Date.now() });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.todayTasks.value).toHaveLength(0);
	});

	it("stats → 按状态统计", async () => {
		const tasks = [
			makeTask({ id: "1", status: "pending" }),
			makeTask({ id: "2", status: "in_progress" }),
			makeTask({ id: "3", status: "done" }),
			makeTask({ id: "4", status: "pending" }),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: Date.now() });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.stats.value).toEqual({
			pending: 2,
			inProgress: 1,
			done: 1,
			total: 4,
		});
	});

	// ── CRUD 乐观更新 ───────────────────────────────────────────

	it("addTask() → 调用 API 然后 unshift 到本地", async () => {
		const initialTasks = [makeTask({ id: "1", title: "Existing" })];
		mockGetWorkspaceTasks.mockResolvedValue({
			tasks: initialTasks,
			updatedAt: 100,
		});
		mockCreateWorkspaceTask.mockResolvedValue({
			task: makeTask({ id: "2", title: "New task" }),
			updatedAt: 200,
		});

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.addTask({ title: "New task" });

		expect(mockCreateWorkspaceTask).toHaveBeenCalledWith({
			title: "New task",
			_expectedUpdatedAt: 100,
		});
		expect(store.tasks.value).toHaveLength(2);
		expect(store.tasks.value[0]!.title).toBe("New task");
	});

	it("addTask() → API 失败时不添加", async () => {
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [], updatedAt: 100 });
		mockCreateWorkspaceTask.mockRejectedValue(new Error("creation failed"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.addTask({ title: "New task" });

		expect(store.tasks.value).toHaveLength(0);
	});

	it("addTask() → 409 时自动 load()", async () => {
		mockGetWorkspaceTasks
			.mockResolvedValueOnce({ tasks: [], updatedAt: 100 })
			.mockResolvedValueOnce({
				tasks: [makeTask({ id: "reloaded" })],
				updatedAt: 200,
			});
		mockCreateWorkspaceTask.mockRejectedValue(new Error("409 Conflict"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(1);
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.addTask({ title: "New task" });

		expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(2);
		expect(store.tasks.value).toHaveLength(1);
		expect(store.tasks.value[0]!.id).toBe("reloaded");
	});

	it("removeTask() → 本地删除 + 调用 API", async () => {
		const tasks = [
			makeTask({ id: "1", title: "To remove" }),
			makeTask({ id: "2", title: "Keep" }),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: 100 });
		mockDeleteWorkspaceTask.mockResolvedValue({ ok: true, updatedAt: 200 });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.removeTask("1");

		expect(mockDeleteWorkspaceTask).toHaveBeenCalledWith("1", 100);
		expect(store.tasks.value).toHaveLength(1);
		expect(store.tasks.value[0]!.id).toBe("2");
	});

	it("removeTask() → API 失败回滚", async () => {
		const tasks = [
			makeTask({ id: "1", title: "To remove" }),
			makeTask({ id: "2", title: "Keep" }),
		];
		mockGetWorkspaceTasks.mockResolvedValue({ tasks, updatedAt: 100 });
		mockDeleteWorkspaceTask.mockRejectedValue(new Error("delete failed"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		expect(store.tasks.value).toHaveLength(2);

		await store.removeTask("1");

		expect(store.tasks.value).toHaveLength(2);
		expect(store.tasks.value[0]!.id).toBe("1");
	});

	it("removeTask() → 409 时自动 load()", async () => {
		const tasks = [makeTask({ id: "1" }), makeTask({ id: "2" })];
		mockGetWorkspaceTasks
			.mockResolvedValueOnce({ tasks, updatedAt: 100 })
			.mockResolvedValueOnce({
				tasks: [makeTask({ id: "reloaded" })],
				updatedAt: 200,
			});
		mockDeleteWorkspaceTask.mockRejectedValue(new Error("409 Conflict"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(1);
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.removeTask("1");

		expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(2);
		expect(store.tasks.value).toHaveLength(1);
		expect(store.tasks.value[0]!.id).toBe("reloaded");
	});

	it("toggleStatus() → pending→in_progress→done→pending 循环", async () => {
		const task = makeTask({ id: "1", status: "pending" });
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [task], updatedAt: 100 });
		mockUpdateWorkspaceTask.mockResolvedValue({ ok: true, updatedAt: 200 });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.toggleStatus(task, "in_progress");
		expect(task.status).toBe("in_progress");

		await store.toggleStatus(task, "done");
		expect(task.status).toBe("done");

		await store.toggleStatus(task, "pending");
		expect(task.status).toBe("pending");
	});

	it("toggleStatus() → API 失败回滚", async () => {
		const task = makeTask({ id: "1", status: "pending" });
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [task], updatedAt: 100 });
		mockUpdateWorkspaceTask.mockRejectedValue(new Error("update failed"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.toggleStatus(task, "done");

		expect(task.status).toBe("pending");
	});

	it("toggleStatus() → 409 时自动 load()", async () => {
		const task = makeTask({ id: "1", status: "pending" });
		mockGetWorkspaceTasks
			.mockResolvedValueOnce({ tasks: [task], updatedAt: 100 })
			.mockResolvedValueOnce({
				tasks: [makeTask({ id: "reloaded" })],
				updatedAt: 200,
			});
		mockUpdateWorkspaceTask.mockRejectedValue(new Error("409 Conflict"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(1);
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.toggleStatus(task, "done");

		expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(2);
		expect(store.tasks.value).toHaveLength(1);
		expect(store.tasks.value[0]!.id).toBe("reloaded");
	});

	it("updateTask() → 本地更新 + 调用 API", async () => {
		const task = makeTask({
			id: "1",
			title: "Original",
			priority: "low",
		});
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [task], updatedAt: 100 });
		mockUpdateWorkspaceTask.mockResolvedValue({ ok: true, updatedAt: 200 });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.updateTask("1", { title: "Updated", priority: "high" });

		expect(task.title).toBe("Updated");
		expect(task.priority).toBe("high");
		expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith("1", {
			title: "Updated",
			priority: "high",
			_expectedUpdatedAt: 100,
		});
	});

	it("updateTask() → API 失败回滚", async () => {
		const task = makeTask({ id: "1", title: "Original" });
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [task], updatedAt: 100 });
		mockUpdateWorkspaceTask.mockRejectedValue(new Error("update failed"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.updateTask("1", { title: "Updated" });

		expect(task.title).toBe("Original");
	});

	it("updateTask() → 409 时自动 load()", async () => {
		const task = makeTask({ id: "1", title: "Original" });
		mockGetWorkspaceTasks
			.mockResolvedValueOnce({ tasks: [task], updatedAt: 100 })
			.mockResolvedValueOnce({
				tasks: [makeTask({ id: "reloaded" })],
				updatedAt: 200,
			});
		mockUpdateWorkspaceTask.mockRejectedValue(new Error("409 Conflict"));

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(1);
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.updateTask("1", { title: "Updated" });

		expect(mockGetWorkspaceTasks).toHaveBeenCalledTimes(2);
		expect(store.tasks.value).toHaveLength(1);
		expect(store.tasks.value[0]!.id).toBe("reloaded");
	});

	it("updateTask() → 支持 dueDate 和 tags 更新", async () => {
		const task = makeTask({
			id: "1",
			title: "Task",
			dueDate: 1000,
			tags: ["a"],
		});
		mockGetWorkspaceTasks.mockResolvedValue({ tasks: [task], updatedAt: 100 });
		mockUpdateWorkspaceTask.mockResolvedValue({ ok: true, updatedAt: 200 });

		const store = useWorkspaceTasks(() => "/test");

		await vi.waitFor(() => {
			expect(mockGetWorkspaceTasks).toHaveBeenCalled();
		});
		await vi.waitFor(() => {
			expect(store.isLoading.value).toBe(false);
		});

		await store.updateTask("1", { dueDate: null, tags: ["b", "c"] });

		expect(task.dueDate).toBeNull();
		expect(task.tags).toEqual(["b", "c"]);
	});
});
