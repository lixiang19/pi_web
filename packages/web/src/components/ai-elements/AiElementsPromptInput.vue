<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Square, Paperclip, Sparkles, Zap, Terminal } from "lucide-vue-next";
import type {
  AgentSummary,
  CommandCatalogItem,
  PromptCatalogItem,
  SkillCatalogItem,
  ThinkingLevel,
} from "@/lib/types";

interface Props {
  sessionId: string | null;
  disabled?: boolean;
  isSending?: boolean;
  canAbort?: boolean;
  draftText?: string;
  modelOptions: Array<{ label: string; value: string }>;
  thinkingOptions: Array<{ value: ThinkingLevel; label: string }>;
  agents: AgentSummary[];
  commands: CommandCatalogItem[];
  prompts: PromptCatalogItem[];
  skills: SkillCatalogItem[];
  autoModelValue: string;
  autoThinkingValue: string;
  noAgentValue: string;
  selectedModel?: string;
  selectedThinkingLevel?: string;
  selectedAgent?: string;
  hasVisibleResources?: boolean;
  isResourcePickerVisible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  isSending: false,
  canAbort: false,
  draftText: "",
  selectedModel: "",
  selectedThinkingLevel: "",
  selectedAgent: "",
  hasVisibleResources: false,
  isResourcePickerVisible: false,
});

const emit = defineEmits<{
  submit: [];
  abort: [];
  "update:draftText": [text: string];
  selectModel: [value: string];
  selectThinking: [value: string];
  selectAgent: [value: string];
  toggleResourcePicker: [];
  applyPrompt: [item: PromptCatalogItem];
  injectCommand: [value: string];
  injectSkill: [value: string];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const localDraft = ref(props.draftText);

watch(() => props.draftText, (newText) => {
  if (newText !== localDraft.value) {
    localDraft.value = newText;
  }
}, { immediate: true });

watch(localDraft, (newText) => {
  emit("update:draftText", newText);
});

const canSubmit = computed(() => {
  return localDraft.value.trim().length > 0 && !props.isSending && !props.disabled;
});

const handleSubmit = () => {
  if (!canSubmit.value) return;
  emit("submit");
};

const handleAbort = () => {
  emit("abort");
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
};

const handleModelSelect = (value: string) => {
  emit("selectModel", value);
};

const handleThinkingSelect = (value: string) => {
  emit("selectThinking", value);
};

const handleAgentSelect = (value: string) => {
  emit("selectAgent", value);
};

const autoResize = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
};

watch(localDraft, () => {
  autoResize();
});
</script>

<template>
  <div class="px-4 pb-5 pt-2">
    <div class="max-w-4xl mx-auto">
      <!-- 悬浮卡片容器 -->
      <div
        class="rounded-xl bg-card overflow-hidden transition-shadow duration-200"
        style="box-shadow: 0 1px 4px rgba(61,50,41,0.06), 0 0 0 1px rgba(45,52,54,0.05);"
      >
        <!-- 输入区域 -->
        <textarea
          ref="textareaRef"
          v-model="localDraft"
          :disabled="isSending"
          :placeholder="disabled
            ? '选择或创建一个会话，开始对话...'
            : '输入消息... (Shift+Enter 换行 · / 触发命令 · @ 触发技能 · # 触发提示词)'"
          class="min-h-[90px] max-h-[200px] w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/55 focus:outline-none disabled:cursor-default"
          rows="1"
          @keydown="handleKeydown"
        />

        <!-- 内部分隔线 -->
        <div class="mx-4 h-px bg-muted/60" />

        <!-- 工具栏 -->
        <div class="flex items-center justify-between px-2 py-2">
          <!-- 左侧：选择器组 -->
          <div class="flex items-center gap-0.5">
            <!-- 模型选择 -->
            <Select
              :model-value="selectedModel"
              :disabled="isSending"
              @update:model-value="handleModelSelect"
            >
              <SelectTrigger
                class="h-7 gap-1 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors duration-150 focus:ring-0 [&>svg:last-child]:hidden"
              >
                <Sparkles class="h-3 w-3 shrink-0" />
                <SelectValue placeholder="模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="autoModelValue">自动</SelectItem>
                <SelectItem v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <!-- 思考级别选择 -->
            <Select
              :model-value="selectedThinkingLevel"
              :disabled="isSending"
              @update:model-value="handleThinkingSelect"
            >
              <SelectTrigger
                class="h-7 gap-1 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors duration-150 focus:ring-0 [&>svg:last-child]:hidden"
              >
                <Zap class="h-3 w-3 shrink-0" />
                <SelectValue placeholder="思考" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="autoThinkingValue">自动</SelectItem>
                <SelectItem v-for="opt in thinkingOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <!-- Agent 选择 -->
            <Select
              :model-value="selectedAgent"
              :disabled="isSending"
              @update:model-value="handleAgentSelect"
            >
              <SelectTrigger
                class="h-7 gap-1 border-0 bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors duration-150 focus:ring-0 [&>svg:last-child]:hidden"
              >
                <Terminal class="h-3 w-3 shrink-0" />
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="noAgentValue">无 Agent</SelectItem>
                <SelectItem v-for="agent in agents" :key="agent.name" :value="agent.name">
                  {{ agent.displayName || agent.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 右侧：资源 + 发送 -->
          <div class="flex items-center gap-1.5">
            <!-- 资源选择按钮 -->
            <Button
              v-if="hasVisibleResources"
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground transition-colors duration-150"
              :class="isResourcePickerVisible ? 'bg-muted text-foreground' : ''"
              @click="emit('toggleResourcePicker')"
            >
              <Paperclip class="h-3.5 w-3.5" />
            </Button>

            <!-- 停止按钮 -->
            <Button
              v-if="canAbort"
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              @click="handleAbort"
            >
              <Square class="h-3.5 w-3.5 fill-current" />
            </Button>

            <!-- 发送按钮 -->
            <Button
              v-else
              :disabled="!canSubmit"
              size="icon"
              class="h-8 w-8 rounded-lg transition-all duration-150"
              @click="handleSubmit"
            >
              <Send class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
