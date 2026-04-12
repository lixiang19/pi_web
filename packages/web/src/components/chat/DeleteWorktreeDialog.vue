<script setup lang="ts">
import { ref, watch } from "vue";
import { useVModel } from "@vueuse/core";
import { LoaderCircle, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteWorktree } from "@/lib/api";

const props = defineProps<{
  open: boolean;
  projectId: string;
  worktreeRoot: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "deleted"): void;
}>();

const open = useVModel(props, "open", emit);

const isDeleting = ref(false);
const errorMessage = ref("");

watch(open, (nextOpen) => {
  if (nextOpen) {
    isDeleting.value = false;
    errorMessage.value = "";
  }
});

const handleDelete = async () => {
  isDeleting.value = true;
  errorMessage.value = "";

  try {
    await deleteWorktree(props.projectId, {
      worktreePath: props.worktreeRoot,
      deleteLocalBranch: true,
      deleteRemoteBranch: true,
    });
    open.value = false;
    emit("deleted");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[420px]" :show-close-button="!isDeleting">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-destructive">
          <Trash2 class="size-4" />
          删除 Worktree
        </DialogTitle>
        <DialogDescription>
          此操作不可撤销，请确认以下内容后继续。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3 py-2 text-sm">
        <div class="rounded-md bg-destructive/5 border border-destructive/20 p-3">
          <p class="text-xs font-medium text-destructive/80 mb-1">路径</p>
          <p class="font-mono text-xs break-all text-foreground">{{ worktreeRoot }}</p>
        </div>

        <div class="text-[13px] text-muted-foreground">
          <p class="font-medium text-foreground mb-1">将同时删除：</p>
          <ul class="list-disc pl-4 space-y-0.5">
            <li>worktree 目录</li>
            <li>关联的本地分支</li>
            <li>关联的远程分支</li>
            <li>该 worktree 下的所有会话</li>
          </ul>
        </div>

        <p v-if="errorMessage" class="text-xs text-destructive">
          删除失败：{{ errorMessage }}
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isDeleting" @click="open = false">
          取消
        </Button>
        <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
          <LoaderCircle v-if="isDeleting" class="mr-2 size-4 animate-spin" />
          {{ isDeleting ? "删除中..." : "删除" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
