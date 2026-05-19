import { computed, type Ref } from "vue";
import type {
	AIDashboardHighlight,
	AIDashboardStat,
	AIDashboardStatIcon,
	TodayRecommendation,
	TodayRecommendationAction,
	YesterdayReview,
} from "@/lib/types";
import type { RecentFileItem } from "@/lib/api";
import type { TaskItem } from "@/composables/useWorkspaceTasks";
import type { InboxItem } from "@/composables/useInbox";
import type { SessionSummary } from "@/lib/types";

export interface AIDashboardInput {
	recentFiles: Ref<RecentFileItem[]>;
	todayTasks: Ref<TaskItem[]>;
	recentMoments: Ref<InboxItem[]>;
	sessions: Ref<SessionSummary[]>;
	hasTodayJournal: Ref<boolean>;
	todayJournalPath: Ref<string>;
}

export function useAIDashboard(input: AIDashboardInput) {
	const yesterdayReview = computed<YesterdayReview>(() => {
		const fileCount = input.recentFiles.value.length;
		const taskCount = input.todayTasks.value.filter((t) => t.status === "completed").length;
		const momentCount = input.recentMoments.value.length;
		const sessionCount = input.sessions.value.length;

		const stats: AIDashboardStat[] = [
			{ label: "会话", value: String(sessionCount), icon: "session" },
			{ label: "文件编辑", value: String(fileCount), icon: "file" },
			{ label: "待办完成", value: String(taskCount), icon: "task" },
			{ label: "闪念捕获", value: String(momentCount), icon: "moment" },
		];

		const highlights: AIDashboardHighlight[] = [];

		// TODO: 未来由 AI 生成，目前基于本地数据生成简短摘要
		if (sessionCount > 0) {
			const latestSession = input.sessions.value[0];
			if (latestSession?.title) {
				highlights.push({
					text: `「${latestSession.title}」会话仍可继续`,
					kind: "insight",
				});
			}
		}
		if (momentCount > 0) {
			highlights.push({
				text: `你有 ${momentCount} 条闪念未归档`,
				kind: "insight",
			});
		}
		if (taskCount > 0) {
			highlights.push({
				text: `今日已完成 ${taskCount} 项待办`,
				kind: "trend",
			});
		}

		const summary = buildSummary(fileCount, taskCount, momentCount, sessionCount, input.hasTodayJournal.value);

		return { summary, stats, highlights };
	});

	const todayRecommendations = computed<TodayRecommendation[]>(() => {
		const recs: TodayRecommendation[] = [];

		// 未完成的会话
		const activeSessions = input.sessions.value.filter(
			(s) => s.title && s.title.length > 0,
		);
		for (const session of activeSessions.slice(0, 2)) {
			recs.push({
				id: `rec-session-${session.id}`,
				title: `继续「${session.title}」`,
				reason: "上次会话有待续内容。",
				priority: "high",
				action: "continue-session" as TodayRecommendationAction,
				icon: "session" as AIDashboardStatIcon,
				actionTarget: session.id,
			});
		}

		// 未处理的闪念
		const unprocessedMoments = input.recentMoments.value.filter((m) => m.status === "pending");
		if (unprocessedMoments.length > 0) {
			recs.push({
				id: "rec-moments",
				title: "整理闪念笔记",
				reason: `你有 ${unprocessedMoments.length} 条未归档的闪念。`,
				priority: "medium",
				action: "open-inbox" as TodayRecommendationAction,
				icon: "moment" as AIDashboardStatIcon,
			});
		}

		// 最近文件
		const recentFile = input.recentFiles.value[0];
		if (recentFile) {
			recs.push({
				id: `rec-file-${recentFile.path}`,
				title: `继续编辑 ${recentFile.name}`,
				reason: "最近修改的文件。",
				priority: "medium",
				action: "open-file" as TodayRecommendationAction,
				icon: "file" as AIDashboardStatIcon,
				actionTarget: recentFile.path,
			});
		}

		// 待办
		const pendingTasks = input.todayTasks.value.filter((t) => t.status !== "completed");
		if (pendingTasks.length > 0) {
			recs.push({
				id: "rec-tasks",
				title: `完成今日待办 (${pendingTasks.length})`,
				reason: `还有 ${pendingTasks.length} 项待办需要处理。`,
				priority: pendingTasks.length > 3 ? "high" : "low",
				action: "open-tasks" as TodayRecommendationAction,
				icon: "task" as AIDashboardStatIcon,
			});
		}

		return recs;
	});

	return { yesterdayReview, todayRecommendations };
}

function buildSummary(
	fileCount: number,
	taskCount: number,
	momentCount: number,
	sessionCount: number,
	hasJournal: boolean,
): string {
	const parts: string[] = [];
	if (sessionCount > 0) {
		parts.push(`进行了 ${sessionCount} 个会话`);
	}
	if (fileCount > 0) {
		parts.push(`编辑了 ${fileCount} 个文件`);
	}
	if (taskCount > 0) {
		parts.push(`完成了 ${taskCount} 项待办`);
	}
	if (momentCount > 0) {
		parts.push(`捕获了 ${momentCount} 条闪念`);
	}
	if (hasJournal) {
		parts.push("写了日记");
	}

	if (parts.length === 0) {
		return "今天还没有开始工作，现在就开始吧。";
	}

	return `昨天你${parts.join("、")}。继续加油！`;
}