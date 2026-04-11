<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { FolderSearch, Mountain } from "lucide-vue-next";

import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
    <!-- 背景微量装饰 -->
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.03]"
      style="background-image: radial-gradient(#e07a5f 0.5px, transparent 0.5px); background-size: 24px 24px"
    ></div>

    <!-- 内容区 -->
    <div class="relative w-full max-w-lg animate-in fade-in zoom-in duration-500">
      <!-- 图标 + 标题 + 引导语 -->
      <div class="mb-10 flex flex-col items-center gap-4">
        <div
          class="flex size-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.03]"
        >
          <Mountain class="size-7" style="color: #e07a5f" />
        </div>
        <div class="space-y-2 text-center">
          <h2 class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e07a5f]/80">
            Start From Project
          </h2>
          <p class="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground/60">
            确认当前工作目录，我们会在这里与你并肩，开启一段新的探索旅程。
          </p>
        </div>
      </div>

      <!-- 标准下拉框 -->
      <Select
        :model-value="currentProjectPathValue || undefined"
        @update:model-value="handleProjectChange"
      >
        <SelectTrigger class="w-full">
          <SelectValue placeholder="选择工作目录..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="path in selectablePaths"
            :key="path"
            :value="path"
          >
            {{ path }}
          </SelectItem>
          <SelectItem :value="SELECT_OTHER_VALUE">
            <div class="flex items-center gap-2">
              <FolderSearch class="size-4" />
              <span>浏览其他文件夹...</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- 状态提示 -->
      <div class="mt-3 flex h-4 justify-center">
        <p v-if="projectError" class="text-xs text-destructive">
          {{ projectError }}
        </p>
        <p v-else-if="isProjectLoading" class="text-xs text-muted-foreground/40">
          加载项目列表...
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
