<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ChevronDown, FolderSearch, Mountain } from "lucide-vue-next";

import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useProjects } from "@/composables/useProjects";

const props = defineProps<{
  currentProjectPath: string;
}>();

const emit = defineEmits<{
  selectPath: [path: string];
}>();

const SELECT_OTHER_VALUE = "__select-other-folder__";

const normalizePath = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");

const isProjectDialogOpen = ref(false);
const projectState = useProjects();
const {
  add: addProject,
  error: projectError,
  isLoading: isProjectLoading,
  load: loadProjects,
  projects,
} = projectState;

const currentProjectPathValue = computed(() => normalizePath(props.currentProjectPath || ""));

// 合并已保存项目和当前路径，去重
const selectablePaths = computed(() => {
  const currentPath = currentProjectPathValue.value;
  const paths = new Set<string>();

  if (currentPath) {
    paths.add(currentPath);
  }

  for (const project of projects.value) {
    paths.add(normalizePath(project.path));
  }

  return Array.from(paths);
});

const handleProjectChange = (value: string) => {
  if (!value) return;

  if (value === SELECT_OTHER_VALUE) {
    isProjectDialogOpen.value = true;
    return;
  }

  if (value !== currentProjectPathValue.value) {
    emit("selectPath", value);
  }
};

const handleProjectConfirm = async (path: string) => {
  const project = await addProject(path);
  if (!project) return;

  isProjectDialogOpen.value = false;
  emit("selectPath", normalizePath(path));
};

onMounted(() => {
  void loadProjects().catch(() => undefined);
});
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center p-6"
    style="background: #faf9f6"
  >
    <!-- 背景微量装饰：极淡的网格或渐变 -->
    <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: radial-gradient(#e07a5f 0.5px, transparent 0.5px); background-size: 24px 24px;"></div>

    <!-- 仪式感卡片：登山起点 -->
    <div class="relative w-full max-w-lg animate-in fade-in zoom-in duration-500">
      <!-- 视觉隐喻：微缩图标 -->
      <div class="mb-10 flex flex-col items-center gap-4">
        <div 
          class="flex size-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.03]"
        >
          <Mountain class="size-7" style="color: #e07a5f" />
        </div>
        <div class="text-center space-y-2">
          <h2 class="text-[10px] font-bold tracking-[0.2em] text-[#e07a5f]/80 uppercase">
            Start From Project
          </h2>
          <p class="text-sm text-muted-foreground/60 max-w-xs mx-auto leading-relaxed">
            确认当前工作目录，我们会在这里与你并肩，开启一段新的探索旅程。
          </p>
        </div>
      </div>

      <!-- 核心卡片：路径选择器 -->
      <Select
        :model-value="currentProjectPathValue || undefined"
        @update:model-value="handleProjectChange"
      >
        <SelectTrigger
          class="group relative flex h-auto w-full flex-col items-start gap-1 overflow-hidden rounded-xl border-none bg-white p-6 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/[0.02] transition-all hover:shadow-[0_20px_40px_rgb(0,0,0,0.06)] hover:ring-black/[0.05]"
        >
          <div class="flex w-full items-center justify-between gap-6">
            <div class="min-w-0 flex-1 space-y-1.5">
              <span class="block text-[10px] font-bold text-[#e07a5f]/60 uppercase tracking-widest">
                Current Location
              </span>
              <p class="truncate font-mono text-[14px] font-bold text-foreground/90">
                {{ currentProjectPathValue || "Browse a folder to start..." }}
              </p>
            </div>
            <!-- 统一图标：垂直居中且不再歪斜 -->
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/30 text-muted-foreground/40 transition-all group-hover:bg-[#e07a5f]/10 group-hover:text-[#e07a5f]">
              <ChevronDown class="size-4.5" />
            </div>
          </div>
        </SelectTrigger>
        
        <SelectContent class="max-h-80 min-w-[var(--radix-select-trigger-width)] rounded-xl border-none bg-white p-2 shadow-2xl ring-1 ring-black/[0.05] z-50">
          <div class="px-2 py-2 pb-2 text-[10px] font-bold tracking-widest text-muted-foreground/30 uppercase">
            Saved Locations
          </div>
          <SelectItem
            v-for="path in selectablePaths"
            :key="path"
            :value="path"
            class="rounded-lg py-3 focus:bg-[#e07a5f]/5 focus:text-foreground cursor-pointer"
          >
            <div class="flex flex-col gap-0.5">
              <span class="break-all font-mono text-[13px] font-medium">{{ path }}</span>
            </div>
          </SelectItem>
          
          <div class="my-1.5 h-px bg-muted/40 mx-2"></div>
          
          <SelectItem 
            :value="SELECT_OTHER_VALUE" 
            class="rounded-lg py-3 focus:bg-[#e07a5f]/5 focus:text-foreground cursor-pointer"
          >
            <div class="flex items-center gap-3">
              <FolderSearch class="size-4 text-muted-foreground/60" />
              <span class="text-[13px] font-semibold">Browse other folders...</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- 状态提示 -->
      <div class="mt-6 flex justify-center h-4">
        <p v-if="projectError" class="text-[10px] font-bold text-destructive/90 animate-in fade-in slide-in-from-top-1">
          {{ projectError }}
        </p>
        <p v-else-if="isProjectLoading" class="text-[10px] font-bold text-muted-foreground/30 animate-pulse">
          Loading projects...
        </p>
      </div>
    </div>

    <ProjectSelectorDialog
      v-model:open="isProjectDialogOpen"
      :pending="isProjectLoading"
      :error="projectError"
      @confirm="handleProjectConfirm"
    />
  </div>
</template>

<style scoped>
/* 移除 Select 组件默认渲染，完全在 Trigger 内通过手动布局控制，确保垂直居中和路径显性 */
:deep([data-radix-select-value]) {
  display: none;
}

/* 隐藏 shadcn 原生自带的、可能导致歪斜的图标 */
:deep(svg:not(.lucide)) {
  display: none;
}
</style>
