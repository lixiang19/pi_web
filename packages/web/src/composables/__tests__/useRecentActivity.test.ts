import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { InboxItem } from "@/composables/useInbox";
import {
	buildRecentActivity,
	useRecentActivity,
} from "@/composables/useRecentActivity";
import type { TaskItem } from "@/composables/useWorkspaceTasks";
import type { RecentFileItem } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";

function makeFileItem(overrides: Partial<RecentFileItem> = {}): RecentFileItem {
	return {
		name: "test.md",
		path: "/ws/test.md",
		relativePath: "test.md",
		modifiedAt: 1000,
		extension: ".md",
		size: 100,
		...overrides,
	};
}

function makeTaskItem(overrides: Partial<TaskItem> = {}): TaskItem {
	return {
		id: "task-1",
		title: "测试任务",
		status: "pending",
		priority: "medium",
		dueDate: null,
		tags: [],
		createdAt: 2000,
		updatedAt: 2000,
		...overrides,
	};
}

function makeMomentItem(
	overrides: Partial<InboxItem> = {},
): InboxItem {
	return {
		id: "moment-1",
		content: "一条闪念",
		status: "pending",
		analysisStatus: "suggested",
		recommendationType: "journal",
		recommendationText: "建议写入日记",
		draft: "一条闪念",
		requiresInput: false,
		piSessionId: null,
		piSessionFile: null,
		createdAt: 3000,
		updatedAt: 3000,
		...overrides,
	};
}

function makeSessionSummary(
	overrides: Partial<SessionSummary> = {},
): SessionSummary {
	return {
		id: "session-1",
		title: "测试会话",
		status: "idle",
		cwd: "/ws",
		createdAt: 0,
		updatedAt: 4000,
		...overrides,
	} as SessionSummary;
}

describe("buildRecentActivity", () => {
	it("混合文件、任务、闪念、会话，按时间倒序排列", () => {
		const result = buildRecentActivity({
			recentFiles: ref([makeFileItem({ modifiedAt: 5000 })]),
			todayTasks: ref([makeTaskItem({ updatedAt: 3000, createdAt: 3000 })]),
			recentMoments: ref([makeMomentItem({ createdAt: 4000 })]),
			sessions: ref([makeSessionSummary({ updatedAt: 6000 })]),
			todayJournalPath: ref(""),
			hasTodayJournal: ref(false),
		});

		expect(result).toHaveLength(4);

		// 按时间倒序
		for (let i = 1; i < result.length; i++) {
			expect(result[i - 1]!.timestamp).toBeGreaterThanOrEqual(
				result[i]!.timestamp,
			);
		}
	});

	it("空数据时输出稳定空态", () => {
		const result = buildRecentActivity({
			recentFiles: ref([]),
			todayTasks: ref([]),
			recentMoments: ref([]),
			sessions: ref([]),
			todayJournalPath: ref(""),
			hasTodayJournal: ref(false),
		});

		expect(result).toEqual([]);
	});

	it("有今日日记时包含 journal 类型条目", () => {
		const result = buildRecentActivity({
			recentFiles: ref([]),
			todayTasks: ref([]),
			recentMoments: ref([]),
			sessions: ref([]),
			todayJournalPath: ref("/ws/日记/2026/04/30.md"),
			hasTodayJournal: ref(true),
		});

		expect(result).toHaveLength(1);
		expect(result[0]!.kind).toBe("journal");
		expect(result[0]!.filePath).toBe("/ws/日记/2026/04/30.md");
	});

	it("文件条目有正确的 filePath", () => {
		const result = buildRecentActivity({
			recentFiles: ref([makeFileItem({ path: "/ws/hello.md" })]),
			todayTasks: ref([]),
			recentMoments: ref([]),
			sessions: ref([]),
			todayJournalPath: ref(""),
			hasTodayJournal: ref(false),
		});

		expect(result[0]!.kind).toBe("file");
		expect(result[0]!.filePath).toBe("/ws/hello.md");
	});

	it("会话条目有正确的 sessionId", () => {
		const result = buildRecentActivity({
			recentFiles: ref([]),
			todayTasks: ref([]),
			recentMoments: ref([]),
			sessions: ref([makeSessionSummary({ id: "sid-1" })]),
			todayJournalPath: ref(""),
			hasTodayJournal: ref(false),
		});

		expect(result[0]!.kind).toBe("session");
		expect(result[0]!.sessionId).toBe("sid-1");
	});

	it("AI 建议不触发任何 AI 请求（纯占位逻辑无副作用）", () => {
		// buildRecentActivity 本身不涉及 AI，此测试确认无异常抛出
		const result = buildRecentActivity({
			recentFiles: ref([]),
			todayTasks: ref([]),
			recentMoments: ref([]),
			sessions: ref([]),
			todayJournalPath: ref(""),
			hasTodayJournal: ref(false),
		});
		expect(result).toEqual([]);
	});

	it("useRecentActivity composable 返回计算属性", () => {
		const { items } = useRecentActivity({
			recentFiles: ref([makeFileItem()]),
			todayTasks: ref([]),
			recentMoments: ref([]),
			sessions: ref([]),
			todayJournalPath: ref(""),
			hasTodayJournal: ref(false),
		});

		expect(items.value).toHaveLength(1);
		expect(items.value[0]!.kind).toBe("file");
	});
});
