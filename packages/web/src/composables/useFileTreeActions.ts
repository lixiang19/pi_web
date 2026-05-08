import type { Ref } from "vue";
import { toast } from "vue-sonner";
import { createFileEntry, moveFileEntry, trashFileEntry } from "@/lib/api";
import type { FileTreeEntry } from "@/lib/types";

export function useFileTreeActions(
	workspaceDir: Ref<string>,
	refreshTree: () => void,
) {
	async function handleDelete(entry: FileTreeEntry) {
		try {
			await trashFileEntry(workspaceDir.value, entry.path);
			refreshTree();
			toast.success(`已删除 ${entry.name}`);
		} catch (err: any) {
			toast.error(`删除失败: ${err.message ?? err}`);
		}
	}

	async function handleRename(payload: { oldPath: string; newName: string }) {
		try {
			await moveFileEntry({
				root: workspaceDir.value,
				path: payload.oldPath,
				name: payload.newName,
			});
			refreshTree();
			toast.success(`已重命名为 ${payload.newName}`);
		} catch (err: any) {
			toast.error(`重命名失败: ${err.message ?? err}`);
		}
	}

	async function handleCreateFolderInTree(payload: {
		parentPath: string;
		name: string;
	}) {
		try {
			await createFileEntry({
				root: workspaceDir.value,
				directory: payload.parentPath,
				name: payload.name,
				kind: "directory",
			});
			refreshTree();
			toast.success(`已创建文件夹 ${payload.name}`);
		} catch (err: any) {
			toast.error(`创建文件夹失败: ${err.message ?? err}`);
		}
	}

	return { handleDelete, handleRename, handleCreateFolderInTree };
}
