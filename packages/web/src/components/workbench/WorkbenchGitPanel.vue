<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import { AlertTriangle, GitBranch } from "lucide-vue-next";

import { useGitState } from "@/composables/useGitState";
import GitStatusHeader from "@/components/workbench/git/GitStatusHeader.vue";
import GitChangesSection from "@/components/workbench/git/GitChangesSection.vue";
import GitCommitSection from "@/components/workbench/git/GitCommitSection.vue";

const props = defineProps<{
  cwd: string;
}>();

const git = useGitState(toRef(() => props.cwd));

const commitMessage = ref("");
const selectedPaths = ref<Set<string>>(new Set());

const currentBranch = computed(() => git.status.value?.current ?? null);
const ahead = computed(() => git.status.value?.ahead ?? 0);
const behind = computed(() => git.status.value?.behind ?? 0);
const files = computed(() => git.status.value?.files ?? []);

const togglePath = (path: string) => {
  const next = new Set(selectedPaths.value);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  selectedPaths.value = next;
};

const toggleAll = () => {
  if (
    files.value.length > 0 &&
    files.value.every((f) => selectedPaths.value.has(f.path))
  ) {
    selectedPaths.value = new Set();
  } else {
    selectedPaths.value = new Set(files.value.map((f) => f.path));
  }
};

const handleCommit = async () => {
  const message = commitMessage.value.trim();
  const paths = [...selectedPaths.value];
  if (!message || paths.length === 0) return;

  await git.commit(message, paths, false);
  commitMessage.value = "";
  selectedPaths.value = new Set();
};

const handleCommitAndPush = async () => {
  const message = commitMessage.value.trim();
  const paths = [...selectedPaths.value];
  if (!message || paths.length === 0) return;

  await git.commit(message, paths, true);
  commitMessage.value = "";
  selectedPaths.value = new Set();
};

// 当 status 刷新时，自动全选新增的文件
const autoSelectNewFiles = () => {
  if (files.value.length > 0 && selectedPaths.value.size === 0) {
    selectedPaths.value = new Set(files.value.map((f) => f.path));
  }
};

// 监听 files 变化自动全选（首次加载）
import { watch } from "vue";
watch(files, () => autoSelectNewFiles(), { immediate: true });
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- 无目录状态 -->
    <div v-if="!cwd" class="flex flex-1 flex-col items-center justify-center gap-3 px-4">
      <GitBranch class="size-10 text-muted-foreground/30" />
      <p class="text-xs text-muted-foreground">未选择项目目录</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="git.error.value && !git.status.value" class="flex flex-1 flex-col items-center justify-center gap-3 px-4">
      <AlertTriangle class="size-8 text-destructive/60" />
      <p class="text-center text-xs text-destructive">{{ git.error.value }}</p>
    </div>

    <!-- Git 面板 -->
    <template v-else>
      <GitStatusHeader
        :current-branch="currentBranch"
        :ahead="ahead"
        :behind="behind"
        :is-loading="git.isLoading.value"
        :is-syncing="git.isSyncing.value"
        @refresh="git.refresh()"
        @fetch="git.fetch()"
        @pull="git.pull()"
        @push="git.push()"
      />

      <div class="flex-1 overflow-auto scrollbar-thin">
        <GitChangesSection
          :files="files"
          :selected-paths="selectedPaths"
          @toggle-path="togglePath"
          @toggle-all="toggleAll"
        />
      </div>

      <GitCommitSection
        :commit-message="commitMessage"
        :selected-count="selectedPaths.size"
        :is-committing="git.isCommitting.value"
        @update:commit-message="commitMessage = $event"
        @commit="handleCommit"
        @commit-and-push="handleCommitAndPush"
      />
    </template>
  </div>
</template>
