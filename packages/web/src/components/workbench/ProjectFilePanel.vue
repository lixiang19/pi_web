<script setup lang="ts">
import { ref, toRef, watch } from "vue";
import { FolderKanban, GitBranch } from "lucide-vue-next";

import WorkspaceFileTree from "@/components/WorkspaceFileTree.vue";
import WorkbenchGitPanel from "@/components/workbench/WorkbenchGitPanel.vue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsGitRepo } from "@/composables/useIsGitRepo";

const props = defineProps<{
  projectLabel: string;
  rootDir: string;
}>();

const activeTab = ref<"git" | "files">("files");
const { isGitRepo } = useIsGitRepo(toRef(() => props.rootDir));

watch(
  () => props.rootDir,
  () => {
    activeTab.value = "files";
  },
  { immediate: true },
);

watch(
  isGitRepo,
  (nextIsGitRepo) => {
    if (nextIsGitRepo) {
      activeTab.value = "git";
      return;
    }

    if (activeTab.value === "git") {
      activeTab.value = "files";
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <!-- Header -->
    <div class="ridge-panel-header flex h-12 items-center justify-between px-4">
      <div class="flex items-center gap-2">
        <component
          :is="activeTab === 'git' && isGitRepo ? GitBranch : FolderKanban"
          class="size-3.5 text-foreground/40"
        />
        <h3 class="text-[10px] font-black uppercase tracking-widest text-foreground/60">
          {{ activeTab === 'git' && isGitRepo ? 'Git' : 'Files' }}
        </h3>
      </div>
      <span class="text-[9px] font-black uppercase opacity-30 tabular-nums">
        {{ projectLabel }}
      </span>
    </div>

    <!-- Tab 导航 -->
    <Tabs v-model="activeTab" class="flex flex-1 flex-col overflow-hidden">
      <TabsList
        class="mx-3 h-8 w-auto grid bg-muted/50 p-0.5"
        :class="isGitRepo ? 'grid-cols-2' : 'grid-cols-1'"
      >
        <TabsTrigger
          v-if="isGitRepo"
          value="git"
          class="text-xs font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          <GitBranch class="mr-1.5 size-3" />
          Git
        </TabsTrigger>
        <TabsTrigger
          value="files"
          class="text-xs font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          <FolderKanban class="mr-1.5 size-3" />
          文件
        </TabsTrigger>
      </TabsList>

      <div class="mt-2 flex-1 overflow-hidden">
        <div v-if="isGitRepo" v-show="activeTab === 'git'" class="h-full overflow-hidden">
          <WorkbenchGitPanel :cwd="rootDir" />
        </div>

        <div v-show="activeTab === 'files'" class="h-full overflow-hidden">
          <WorkspaceFileTree :root-dir="rootDir" />
        </div>
      </div>
    </Tabs>
  </div>
</template>
