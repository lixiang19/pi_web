import { type Ref, ref, watch } from "vue";

import { getGitRepositoryStatus } from "@/lib/api";

export function useIsGitRepo(cwd: Ref<string>) {
	const isGitRepo = ref(false);
	const isChecking = ref(false);
	let requestToken = 0;

	watch(
		cwd,
		async (nextCwd) => {
			const token = ++requestToken;

			if (!nextCwd) {
				isGitRepo.value = false;
				isChecking.value = false;
				return;
			}

			isGitRepo.value = false;
			isChecking.value = true;

			try {
				await getGitRepositoryStatus(nextCwd);
				if (token !== requestToken) {
					return;
				}

				isGitRepo.value = true;
			} catch {
				if (token !== requestToken) {
					return;
				}

				isGitRepo.value = false;
			} finally {
				if (token === requestToken) {
					isChecking.value = false;
				}
			}
		},
		{ immediate: true },
	);

	return {
		isGitRepo,
		isChecking,
	};
}
