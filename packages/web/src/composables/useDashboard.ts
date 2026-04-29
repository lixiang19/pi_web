import { computed, ref, watch } from "vue";

import { getNoteContent, getRecentFiles, type RecentFileItem } from "@/lib/api";

const JOURNAL_BASE = "日记";

export function useDashboard(workspaceDir: () => string) {
	const recentFiles = ref<RecentFileItem[]>([]);
	const isLoadingRecent = ref(false);
	const recentError = ref("");

	const todayJournalContent = ref("");
	const todayJournalPath = ref("");
	const isLoadingJournal = ref(false);
	const hasTodayJournal = ref(false);

	const loadRecentFiles = async () => {
		const dir = workspaceDir();
		if (!dir) return;

		isLoadingRecent.value = true;
		recentError.value = "";
		try {
			const response = await getRecentFiles(dir, 8);
			recentFiles.value = response.files;
		} catch (err) {
			recentError.value = err instanceof Error ? err.message : String(err);
		} finally {
			isLoadingRecent.value = false;
		}
	};

	const loadTodayJournal = async () => {
		const dir = workspaceDir();
		if (!dir) return;

		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const dateStr = `${year}-${month}-${day}`;
		const journalPath = `${dir}/${JOURNAL_BASE}/${year}/${month}/${dateStr}.md`;

		todayJournalPath.value = journalPath;
		isLoadingJournal.value = true;
		hasTodayJournal.value = false;

		try {
			const response = await getNoteContent(journalPath.replace(dir + "/", ""));
			todayJournalContent.value = response.content;
			hasTodayJournal.value = true;
		} catch {
			// 日记不存在
			todayJournalContent.value = "";
			hasTodayJournal.value = false;
		} finally {
			isLoadingJournal.value = false;
		}
	};

	const journalPreview = computed(() => {
		const content = todayJournalContent.value;
		if (!content) return "";

		// 跳过 frontmatter
		let body = content;
		if (content.startsWith("---")) {
			const fmEnd = content.indexOf("\n---", 4);
			if (fmEnd > 0) {
				body = content.slice(fmEnd + 4).trim();
			}
		}

		const lines = body.split("\n").filter((l) => l.trim());
		return lines.slice(0, 3).join("\n");
	});

	const refresh = async () => {
		await Promise.all([loadRecentFiles(), loadTodayJournal()]);
	};

	watch(
		() => workspaceDir(),
		(dir) => {
			if (dir) refresh();
		},
		{ immediate: true },
	);

	return {
		recentFiles,
		isLoadingRecent,
		recentError,
		todayJournalPath,
		todayJournalContent,
		journalPreview,
		isLoadingJournal,
		hasTodayJournal,
		refresh,
	};
}
