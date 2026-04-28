import { type Ref, ref, watch } from "vue";

import { getGitRepositoryStatus } from "@/lib/api";

export interface GitRepositoryStatus {
	engine: "cli" | "iso";
	canCommit: boolean;
	canPushPull: boolean;
	canWorktree: boolean;
	label: string;
}

export function useGitRepositoryStatus(cwd: Ref<string>) {
	const status = ref<GitRepositoryStatus | null>(null);
	const isChecking = ref(false);
	let requestToken = 0;

	watch(
		cwd,
		async (nextCwd) => {
			const token = ++requestToken;

			if (!nextCwd) {
				status.value = null;
				isChecking.value = false;
				return;
			}

			status.value = null;
			isChecking.value = true;

			try {
				const result = await getGitRepositoryStatus(nextCwd);
				if (token !== requestToken) {
					return;
				}

				status.value = result;
			} catch {
				if (token !== requestToken) {
					return;
				}

				status.value = null;
			} finally {
				if (token === requestToken) {
					isChecking.value = false;
				}
			}
		},
		{ immediate: true },
	);

	return {
		status,
		isChecking,
	};
}
