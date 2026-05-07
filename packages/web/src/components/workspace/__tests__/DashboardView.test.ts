import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardView from "@/components/workspace/DashboardView.vue";

const tasks = ref<Array<{
	id: string;
	title: string;
	status: "pending" | "in_progress" | "done";
	priority: "low" | "medium" | "high";
	dueDate: number | null;
	tags: string[];
	createdAt: number;
	updatedAt: number;
	kind?: "goal" | "task";
	sessionId?: string;
	source?: "dashboard";
}>>([]);

vi.mock("@/composables/useDashboard", () => ({
	useDashboard: () => ({
		recentFiles: ref([]),
		isLoadingRecent: ref(false),
		journalPreview: ref(""),
		isLoadingJournal: ref(false),
		hasTodayJournal: ref(false),
		todayJournalPath: ref(""),
	}),
}));

vi.mock("@/composables/useWorkspaceTasks", () => ({
	useWorkspaceTasks: () => ({
		tasks,
		todayTasks: computed(() => tasks.value.filter((task) => task.status !== "done")),
	}),
}));

vi.mock("@/composables/useInbox", () => ({
	useWorkspaceInbox: () => ({
		filteredFiles: ref([]),
		count: ref(0),
		formatTime: (value: number) => String(value),
	}),
}));

const mountDashboard = () =>
	mount(DashboardView, {
		props: { workspaceDir: "/tmp/workspace" },
		global: {
			stubs: {
				Button: { template: "<button><slot /></button>" },
			},
		},
	});

describe("DashboardView goal entry", () => {
	beforeEach(() => {
		tasks.value = [];
	});

	it("emits a trimmed goal only for non-empty submissions", async () => {
		const wrapper = mountDashboard();
		const input = wrapper.get('[data-test="dashboard-goal-input"]');

		await input.setValue("   ");
		await wrapper.get('[data-test="dashboard-goal-form"]').trigger("submit");
		expect(wrapper.emitted("create-goal")).toBeUndefined();

		await input.setValue("  整理 pi_web MVP  ");
		await wrapper.get('[data-test="dashboard-goal-form"]').trigger("submit");
		expect(wrapper.emitted("create-goal")?.[0]).toEqual(["整理 pi_web MVP"]);
	});

	it("shows only dashboard goal tasks and emits their session id", async () => {
		tasks.value = [
			{
				id: "task-normal",
				title: "普通任务",
				status: "pending",
				priority: "medium",
				dueDate: null,
				tags: [],
				createdAt: 1,
				updatedAt: 1,
			},
			{
				id: "task-goal",
				title: "推进 MVP",
				status: "pending",
				priority: "medium",
				dueDate: null,
				tags: [],
				createdAt: 2,
				updatedAt: 2,
				kind: "goal",
				source: "dashboard",
				sessionId: "session-123",
			},
		];

		const wrapper = mountDashboard();
		const goalList = wrapper.get('[data-test="dashboard-goal-list"]');
		expect(goalList.text()).toContain("推进 MVP");
		expect(goalList.text()).not.toContain("普通任务");

		await wrapper.get('[data-test="dashboard-goal-session"]').trigger("click");
		expect(wrapper.emitted("open-goal-session")?.[0]).toEqual(["session-123"]);
	});
});
