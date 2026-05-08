import { computed, type Ref } from "vue";
import type { InboxMomentItem } from "@/composables/useInbox";
import type { TaskItem } from "@/composables/useWorkspaceTasks";
import type { RecentFileItem } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";

// ===== 类型 =====

export type RecentActivityKind =
	| "file"
	| "task"
	| "moment"
	| "journal"
	| "session";

export interface RecentActivityItem {
	id: string;
	kind: RecentActivityKind;
	title: string;
	timestamp: number;
	/** 文件绝对路径（kind=file/journal 时有值） */
	filePath?: string;
	/** 会话 ID（kind=session 时有值） */
	sessionId?: string;
	/** 任务 ID（kind=task 时有值） */
	taskId?: string;
	/** 闪念条目（kind=moment 时有值） */
	momentItem?: InboxMomentItem;
}

export interface RecentActivityInput {
	recentFiles: Ref<RecentFileItem[]>;
	todayTasks: Ref<TaskItem[]>;
	recentMoments: Ref<InboxMomentItem[]>;
	sessions: Ref<SessionSummary[]>;
	todayJournalPath: Ref<string>;
	hasTodayJournal: Ref<boolean>;
}

/** 从各种数据源构建混合最近事情列表，按时间倒序排列 */
export function buildRecentActivity(
	input: RecentActivityInput,
): RecentActivityItem[] {
	const items: RecentActivityItem[] = [];

	// 最近文件
	for (const file of input.recentFiles.value) {
		items.push({
			id: `file-${file.path}`,
			kind: "file",
			title: file.name,
			timestamp: file.modifiedAt,
			filePath: file.path,
		});
	}

	// 今日待办
	for (const task of input.todayTasks.value) {
		items.push({
			id: `task-${task.id}`,
			kind: "task",
			title: task.title,
			timestamp: task.updatedAt || task.createdAt,
			taskId: task.id,
		});
	}

	// 最近闪念
	for (const moment of input.recentMoments.value) {
		items.push({
			id: `moment-${moment.id}`,
			kind: "moment",
			title: moment.preview || moment.content.split("\n")[0] || "闪念",
			timestamp: moment.timestamp,
			momentItem: moment,
			filePath: moment.path,
		});
	}

	// 今日日记
	if (input.hasTodayJournal.value && input.todayJournalPath.value) {
		const now = new Date();
		items.push({
			id: `journal-today`,
			kind: "journal",
			title: "今日日记",
			timestamp: now.getTime(),
			filePath: input.todayJournalPath.value,
		});
	}

	// 最近会话
	for (const session of input.sessions.value.slice(0, 5)) {
		items.push({
			id: `session-${session.id}`,
			kind: "session",
			title: session.title || "新会话",
			timestamp: session.updatedAt || 0,
			sessionId: session.id,
		});
	}

	// 按时间倒序
	items.sort((a, b) => b.timestamp - a.timestamp);

	return items;
}

export function useRecentActivity(input: RecentActivityInput) {
	const items = computed(() => buildRecentActivity(input));
	return { items };
}
