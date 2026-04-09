<script setup lang="ts">
import {
  Bot,
  Brain,
  Lightbulb,
  SendHorizontal,
  Square,
} from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
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
  autoModelValue: string;
  autoThinkingValue: string;
  commands: CommandCatalogItem[];
  composer: ChatComposerState;
  hasVisibleResources: boolean;
  isResourcePickerVisible: boolean;
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
  selectAgent: [value: unknown];
  selectModel: [value: unknown];
  selectThinking: [value: unknown];
  submit: [];
  toggleResourcePicker: [];
  "update:value": [string];
}>();

const draftText = computed({
  get: () => props.value,
  set: (value: string) => emit("update:value", value),
});

const isDraggingOver = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

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
  event.dataTransfer!.dropEffect = 'copy';
  isDraggingOver.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  // 确保是真正离开textarea而不是进入子元素
  const relatedTarget = event.relatedTarget as HTMLElement;
  const textarea = event.currentTarget as HTMLElement;

  if (!textarea.contains(relatedTarget)) {
    isDraggingOver.value = false;
  }
};

// 获取当前模型显示值
const currentModelLabel = computed(() => {
  const val = props.composer.selectedModel || props.autoModelValue;
  if (val === props.autoModelValue) return "Auto";
  const model = props.modelOptions.find((m) => m.value === val);
  return model?.label || val;
});

// 获取当前思考级别显示值
const currentThinkingLabel = computed(() => {
  const val = props.composer.selectedThinkingLevel || props.autoThinkingValue;
  if (val === props.autoThinkingValue) return "Auto";
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
  <div class="shrink-0 border-t border-border bg-background">
    <div class="mx-auto max-w-3xl px-4 py-3">
      <!-- 输入框 -->
      <div class="relative">
        <div
          class="rounded-lg border transition-all duration-200"
          :class="isDraggingOver
            ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
            : 'border-border bg-muted/30 hover:border-border/80'"
        >
          <Textarea
            ref="textareaRef"
            v-model="draftText"
            placeholder="输入消息... (可拖拽文件到此处)"
            class="min-h-[80px] resize-none border-0 bg-transparent px-3 py-3 pr-12 text-sm leading-6 focus-visible:ring-0 focus-visible:ring-offset-0"
            :class="isDraggingOver ? 'placeholder:text-primary/70' : ''"
            @keydown.enter.prevent="emit('submit')"
            @drop="handleDrop"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
          />
        </div>

        <!-- 发送按钮 -->
        <div class="absolute bottom-2.5 right-2.5">
          <Button
            size="icon"
            class="size-8 rounded-md shadow-sm transition-all duration-200"
            :class="isSending || !value.trim()
              ? 'opacity-50'
              : 'hover:scale-105'"
            :disabled="isSending || !value.trim()"
            @click="emit('submit')"
          >
            <Square v-if="isSending" class="size-4 fill-current" />
            <SendHorizontal v-else class="size-4" />
          </Button>
        </div>

        <!-- 拖拽提示 -->
        <div
          v-if="isDraggingOver"
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <span class="text-xs font-medium text-primary bg-background/90 px-3 py-1 rounded-full shadow-sm border border-primary/20">
            释放以插入文件路径
          </span>
        </div>
      </div>

      <!-- 底部工具栏 -->
      <div class="mt-3 flex items-center justify-between">
        <!-- 左侧：选项选择器 -->
        <div class="flex items-center gap-1">
          <!-- 模型选择器 -->
          <Select
            :model-value="composer.selectedModel || autoModelValue"
            @update:model-value="emit('selectModel', $event)"
          >
            <SelectTrigger
              size="sm"
              class="h-7 gap-1.5 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-all duration-200"
            >
              <Brain class="size-3.5 shrink-0" />
              <span class="font-medium">{{ currentModelLabel }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="autoModelValue">Auto</SelectItem>
              <SelectItem
                v-for="model in modelOptions"
                :key="model.value"
                :value="model.value"
              >
                {{ model.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- 思考级别选择器 -->
          <Select
            :model-value="composer.selectedThinkingLevel || autoThinkingValue"
            @update:model-value="emit('selectThinking', $event)"
          >
            <SelectTrigger
              size="sm"
              class="h-7 gap-1.5 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-all duration-200"
            >
              <Lightbulb class="size-3.5 shrink-0" />
              <span class="font-medium">{{ currentThinkingLabel }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="autoThinkingValue">Auto</SelectItem>
              <SelectItem
                v-for="thinking in thinkingOptions"
                :key="thinking.value"
                :value="thinking.value"
              >
                {{ thinking.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- Agent选择器 -->
          <Select
            :model-value="composer.selectedAgent || noAgentValue"
            @update:model-value="emit('selectAgent', $event)"
          >
            <SelectTrigger
              size="sm"
              class="h-7 max-w-[120px] gap-1.5 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-all duration-200"
            >
              <Bot class="size-3.5 shrink-0" />
              <span class="truncate font-medium">{{ currentAgentLabel }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="noAgentValue">Direct</SelectItem>
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

        <!-- 右侧：资源选择按钮 -->
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-md transition-all duration-200"
          :class="isResourcePickerVisible ? 'bg-accent/50 text-foreground' : ''"
          @click="emit('toggleResourcePicker')"
        >
          <span class="text-primary font-semibold">/</span>
          <span class="font-medium">Resources</span>
        </Button>
      </div>

      <!-- 资源选择器（展开/收起） -->
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
    </div>
  </div>
</template>
