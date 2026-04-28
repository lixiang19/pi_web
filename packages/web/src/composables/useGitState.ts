import { type Ref, ref, watch } from "vue";
import type { GitRepositoryStatus } from "@/composables/useGitRepositoryStatus";
import {
	getGitBranches,
	getGitStatus,
	gitCommit,
	gitFetch,
	gitPull,
	gitPush,
} from "@/lib/api";
import type { GitBranchesResponse, GitStatusResponse } from "@/lib/types";

/**
 * Git 状态 composable。
 *
 * 基于 effectiveDirectory，自动拉取 status/branches，
 * 提供 commit/push/pull/fetch 操作方法。
 */
export function useGitState(
	cwd: Ref<string>,
	repoStatus: Ref<GitRepositoryStatus | null>,
) {
	const status = ref<GitStatusResponse | null>(null);
	const branches = ref<GitBranchesResponse | null>(null);
	const isLoading = ref(false);
	const isSyncing = ref(false);
	const isCommitting = ref(false);
	const error = ref("");

	const refreshStatus = async () => {
		const dir = cwd.value;
		if (!dir) {
			status.value = null;
			return;
		}

		try {
			status.value = await getGitStatus(dir);
		} catch (caughtError) {
			error.value =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
		}
	};

	const refreshBranches = async () => {
		const dir = cwd.value;
		if (!dir) {
			branches.value = null;
			return;
		}

		try {
			branches.value = await getGitBranches(dir);
		} catch (caughtError) {
			error.value =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
		}
	};

	const refresh = async () => {
		isLoading.value = true;
		error.value = "";
		try {
			await Promise.all([refreshStatus(), refreshBranches()]);
		} finally {
			isLoading.value = false;
		}
	};

	const doFetch = async () => {
		const dir = cwd.value;
		if (!dir) return;
		if (!repoStatus.value?.canPushPull) return;

		isSyncing.value = true;
		error.value = "";
		try {
			await gitFetch({ cwd: dir });
			await refreshStatus();
		} catch (caughtError) {
			error.value =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
		} finally {
			isSyncing.value = false;
		}
	};

	const doPull = async () => {
		const dir = cwd.value;
		if (!dir) return;
		if (!repoStatus.value?.canPushPull) return;

		isSyncing.value = true;
		error.value = "";
		try {
			await gitPull({ cwd: dir });
			await refresh();
		} catch (caughtError) {
			error.value =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
		} finally {
			isSyncing.value = false;
		}
	};

	const doPush = async () => {
		const dir = cwd.value;
		if (!dir) return;
		if (!repoStatus.value?.canPushPull) return;

		isSyncing.value = true;
		error.value = "";
		try {
			await gitPush({ cwd: dir });
			await refreshStatus();
		} catch (caughtError) {
			error.value =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
		} finally {
			isSyncing.value = false;
		}
	};

	const doCommit = async (
		message: string,
		files: string[],
		pushAfter = false,
	) => {
		const dir = cwd.value;
		if (!dir) return;

		isCommitting.value = true;
		error.value = "";
		try {
			await gitCommit({ cwd: dir, message, files });
			if (pushAfter && repoStatus.value?.canPushPull) {
				await gitPush({ cwd: dir });
			}
			await refresh();
		} catch (caughtError) {
			error.value =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
		} finally {
			isCommitting.value = false;
		}
	};

	// 当 cwd 变化时自动刷新
	watch(
		cwd,
		(nextCwd) => {
			if (nextCwd) {
				void refresh();
			} else {
				status.value = null;
				branches.value = null;
				error.value = "";
			}
		},
		{ immediate: true },
	);

	return {
		status,
		branches,
		isLoading,
		isSyncing,
		isCommitting,
		error,
		refresh,
		fetch: doFetch,
		pull: doPull,
		push: doPush,
		commit: doCommit,
	};
}
