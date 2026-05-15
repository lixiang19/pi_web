import { ref } from "vue";
import {
	getWorkspaceSpacePreviewHtml,
	getWorkspaceSpaceWorks,
} from "@/lib/api";
import type {
	SpacePreviewHtmlResponse,
	SpaceWorkItem,
} from "@/lib/types";

export function useWorkspaceSpace() {
	const works = ref<SpaceWorkItem[]>([]);
	const loading = ref(false);
	const error = ref("");

	async function load() {
		loading.value = true;
		error.value = "";
		try {
			const response = await getWorkspaceSpaceWorks();
			works.value = response.works;
		} catch (loadError) {
			error.value = loadError instanceof Error
				? loadError.message
				: "空间作品加载失败";
			works.value = [];
		} finally {
			loading.value = false;
		}
	}

	async function openPreview(id: string): Promise<SpacePreviewHtmlResponse> {
		return getWorkspaceSpacePreviewHtml(id);
	}

	return {
		works,
		loading,
		error,
		load,
		openPreview,
	};
}
