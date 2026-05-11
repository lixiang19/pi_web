<script setup lang="ts">
import {
  Bot,
  Brain,
  FolderSearch,
  Lightbulb,
  SendHorizontal,
  Square,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, ref } from "vue";
import type { AcceptableValue } from "reka-ui";
import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import WorkbenchResourcePicker from "@/components/workbench/chat/WorkbenchResourcePicker.vue";
import { useProjects } from "@/composables/useProjects";
import type {
  AgentSummary,
  ChatComposerState,
  CommandCatalogItem,
  PromptCatalogItem,
  SkillCatalogItem,
  ThinkingLevel,
} from "@/lib/types";

const props = defineProps<{
  agents: AgentSummary[];
  commands: CommandCatalogItem[];
  composer: ChatComposerState;
  currentProjectPath: string;
  hasVisibleResources: boolean;
  isResourcePickerVisible: boolean;
  isDraftSession: boolean;
  isSending: boolean;
  modelOptions: Array<{ label: string; value: string }>;
  noAgentValue: string;
  prompts: PromptCatalogItem[];
  resourceError: string;
  skills: SkillCatalogItem[];
  thinkingOptions: Array<{ value: ThinkingLevel; label: string }>;
  value: string;
}>();

const emit = defineEmits<{
  applyPrompt: [PromptCatalogItem];
  injectCommand: [string];
  injectSkill: [string];
  selectAgent: [value: string];
  selectModel: [value: string];
  selectThinking: [value: ThinkingLevel];
  selectProjectPath: [path: string];
  submit: [];
  abort: [];
  toggleResourcePicker: [];
  "update:value": [string];
}>();

const draftText = computed({
  get: () => props.value,
  set: (value: string) => emit("update:value", value),
});

// --- 项目选择器逻辑 ---
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

const stringifySelectValue = (value: AcceptableValue): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
};

const handleProjectChange = (value: AcceptableValue) => {
  const nextValue = stringifySelectValue(value);
  if (!nextValue) return;

  if (nextValue === SELECT_OTHER_VALUE) {
    isProjectDialogOpen.value = true;
    return;
  }

  if (nextValue !== currentProjectPathValue.value) {
    emit("selectProjectPath", nextValue);
  }
};

const handleProjectConfirm = async (path: string) => {
  const project = await addProject(path);
  if (!project) return;

  isProjectDialogOpen.value = false;
  emit("selectProjectPath", normalizePath(path));
};
const handleModelChange = (value: AcceptableValue) => {
  const nextValue = stringifySelectValue(value);
  if (nextValue) {
    emit("selectModel", nextValue);
  }
};

const handleThinkingChange = (value: AcceptableValue) => {
  const nextValue = stringifySelectValue(value);
  if (nextValue) {
    emit("selectThinking", nextValue as ThinkingLevel);
  }
};

const handleAgentChange = (value: AcceptableValue) => {
  const nextValue = stringifySelectValue(value);
  if (nextValue) {
    emit("selectAgent", nextValue);
  }
};

onMounted(() => {
  void loadProjects().catch(() => undefined);
});

const isDraggingOver = ref(false);

// 在光标位置插入文本
const insertAtCursor = (textarea: HTMLTextAreaElement, text: string) => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const currentValue = draftText.value;

  const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
  draftText.value = newValue;

  // 恢复光标位置在插入文本之后
  nextTick(() => {
    const newCursorPos = start + text.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
  });
};

// 处理拖放事件
const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  isDraggingOver.value = false;

  const path = event.dataTransfer?.getData('text/plain');
  if (!path) return;

  const textarea = event.target as HTMLTextAreaElement;
  if (textarea.tagName !== 'TEXTAREA') return;

  // 在光标位置插入路径，并添加空格
  insertAtCursor(textarea, path + ' ');
};

// 处理拖拽悬停
const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  isDraggingOver.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  const relatedTarget = event.relatedTarget as HTMLElement | null;
  const textarea = event.currentTarget as HTMLElement;

  if (!relatedTarget || !textarea.contains(relatedTarget)) {
    isDraggingOver.value = false;
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (props.composer.canAbort) {
      emit("abort");
      return;
    }
    if (draftText.value.trim()) {
      emit("submit");
    }
  }
};

// 获取当前模型显示值 — 始终显示具体模型名
const currentModelLabel = computed(() => {
  const val = props.composer.selectedModel;
  const model = props.modelOptions.find((m) => m.value === val);
  return model?.label || val;
});

// 获取当前思考级别显示值 — 始终显示具体级别名
const currentThinkingLabel = computed(() => {
  const val = props.composer.selectedThinkingLevel;
  const option = props.thinkingOptions.find((t) => t.value === val);
  return option?.label || val;
});

// 获取当前Agent显示值
const currentAgentLabel = computed(() => {
  const val = props.composer.selectedAgent || props.noAgentValue;
  if (val === props.noAgentValue) return "Direct";
  const agent = props.agents.find((a) => a.name === val);
  return agent?.displayName || agent?.name || val;
});
</script>

<template>
  <div class="shrink-0 bg-background">
    <div class="mx-auto max-w-3xl px-4 py-3">
      <!-- 项目选择行 -->
      <div v-if="isDraftSession" class="mb-2 flex items-center gap-2">
        <span class="shrink-0 text-xs text-muted-foreground">当前项目：</span>
        <Select
          :model-value="currentProjectPathValue || undefined"
          @update:model-value="handleProjectChange"
        >
          <SelectTrigger
            size="sm"
            class="h-7 w-full max-w-xs gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground"
          >
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
        <span v-if="projectError" class="text-xs text-destructive">{{ projectError }}</span>
        <span v-else-if="isProjectLoading" class="text-xs text-muted-foreground/40">加载中...</span>
      </div>
      <div class="relative rounded-xl bg-card shadow-[0_1px_4px_rgba(61,50,41,0.06),0_0_0_1px_rgba(45,52,54,0.05)] transition-shadow duration-200">
        <div
          class="relative overflow-hidden rounded-xl transition-all duration-200"
          :class="isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''"
        >
          <Textarea
            v-model="draftText"
            placeholder="输入消息… 支持 Markdown，Shift + Enter 换行，可拖拽文件路径到输入框"
            class="min-h-[96px] resize-none border-0 bg-transparent px-4 py-3 pr-14 text-sm leading-6 focus-visible:ring-0 focus-visible:ring-offset-0"
            :class="isDraggingOver ? 'placeholder:text-primary/70' : ''"
            @keydown="handleKeydown"
            @drop="handleDrop"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
          />

          <div
            v-if="isDraggingOver"
            class="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span class="rounded-full border border-primary/20 bg-background/95 px-3 py-1 text-xs font-medium text-primary shadow-sm">
              释放以插入文件路径
            </span>
          </div>

          <div class="absolute bottom-3 right-3">
            <Button
              v-if="composer.canAbort"
              size="icon"
              variant="secondary"
              class="size-9 rounded-lg"
              @click="emit('abort')"
            >
              <Square class="size-4 fill-current" />
            </Button>
            <Button
              v-else
              size="icon"
              class="size-9 rounded-lg"
              :disabled="!value.trim()"
              @click="emit('submit')"
            >
              <SendHorizontal class="size-4" />
            </Button>
          </div>
        </div>

        <div class="mx-4 h-px bg-border/60" />

        <div class="flex flex-wrap items-center justify-between gap-2 px-2 py-2.5">
          <div class="flex flex-wrap items-center gap-1">
            <Select
              :model-value="composer.selectedModel"
              @update:model-value="handleModelChange"
            >
              <SelectTrigger
                size="sm"
                class="h-8 gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground"
              >
                <Brain class="size-3.5 shrink-0" />
                <span class="font-medium">{{ currentModelLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="model in modelOptions"
                  :key="model.value"
                  :value="model.value"
                >
                  {{ model.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              :model-value="composer.selectedThinkingLevel"
              @update:model-value="handleThinkingChange"
            >
              <SelectTrigger
                size="sm"
                class="h-8 gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground"
              >
                <Lightbulb class="size-3.5 shrink-0" />
                <span class="font-medium">{{ currentThinkingLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="thinking in thinkingOptions"
                  :key="thinking.value"
                  :value="thinking.value"
                >
                  {{ thinking.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              :model-value="composer.selectedAgent || noAgentValue"
              @update:model-value="handleAgentChange"
            >
              <SelectTrigger
                size="sm"
                class="h-8 max-w-[160px] gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground"
              >
                <Bot class="size-3.5 shrink-0" />
                <span class="truncate font-medium">{{ currentAgentLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="noAgentValue">直接模式</SelectItem>
                <SelectItem
                  v-for="agent in agents"
                  :key="agent.name"
                  :value="agent.name"
                >
                  {{ agent.displayName || agent.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            v-if="hasVisibleResources"
            variant="ghost"
            size="sm"
            class="h-8 gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
            :class="isResourcePickerVisible ? 'bg-accent/50 text-foreground' : ''"
            @click="emit('toggleResourcePicker')"
          >
            <span class="font-semibold text-primary">/</span>
            <span class="font-medium">资源</span>
          </Button>
        </div>
      </div>

      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="-translate-y-2 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-2 opacity-0"
      >
        <WorkbenchResourcePicker
          v-if="isResourcePickerVisible"
          class="mt-2"
          :commands="commands"
          :has-visible-resources="hasVisibleResources"
          :prompts="prompts"
          :resource-error="resourceError"
          :skills="skills"
          @apply-prompt="emit('applyPrompt', $event)"
          @inject-command="emit('injectCommand', $event)"
          @inject-skill="emit('injectSkill', $event)"
        />
      </transition>
      <ProjectSelectorDialog
        v-model:open="isProjectDialogOpen"
        :pending="isProjectLoading"
        :error="projectError"
        @confirm="handleProjectConfirm"
      />
    </div>
  </div>
</template>
