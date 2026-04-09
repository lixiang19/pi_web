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
  <div class="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
    <div class="flex flex-col gap-2 max-w-4xl mx-auto">
      <div v-if="hasVisibleResources" class="flex items-center gap-2 px-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="isResourcePickerVisible ? 'bg-accent' : ''"
          @click="emit('toggleResourcePicker')"
        >
          <Paperclip class="h-4 w-4 mr-1" />
          资源
        </Button>
        <span class="text-xs text-muted-foreground">
          使用 / 触发命令，@ 触发技能，# 触发提示词
        </span>
      </div>

      <textarea
        ref="textareaRef"
        v-model="localDraft"
        :disabled="disabled || isSending"
        :placeholder="disabled ? '选择一个会话来开始对话...' : '输入消息... (Shift+Enter 换行)'"
        class="min-h-[80px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        rows="1"
        @keydown="handleKeydown"
      />

      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 flex-wrap">
          <Select
            :model-value="selectedModel"
            @update:model-value="handleModelSelect"
            :disabled="isSending"
          >
            <SelectTrigger class="w-[140px] h-8 text-xs">
              <Sparkles class="h-3 w-3 mr-1" />
              <SelectValue placeholder="模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="autoModelValue">自动</SelectItem>
              <SelectItem v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :model-value="selectedThinkingLevel"
            @update:model-value="handleThinkingSelect"
            :disabled="isSending"
          >
            <SelectTrigger class="w-[120px] h-8 text-xs">
              <Zap class="h-3 w-3 mr-1" />
              <SelectValue placeholder="思考级别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="autoThinkingValue">自动</SelectItem>
              <SelectItem v-for="opt in thinkingOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :model-value="selectedAgent"
            @update:model-value="handleAgentSelect"
            :disabled="isSending"
          >
            <SelectTrigger class="w-[140px] h-8 text-xs">
              <Terminal class="h-3 w-3 mr-1" />
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="noAgentValue">无 Agent</SelectItem>
              <SelectItem v-for="agent in agents" :key="agent.id" :value="agent.id">
                {{ agent.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex items-center gap-2">
          <Button
            v-if="canAbort"
            variant="destructive"
            size="icon"
            class="h-8 w-8"
            @click="handleAbort"
          >
            <Square class="h-4 w-4" />
          </Button>
          <Button
            v-else
            :disabled="!canSubmit"
            size="icon"
            class="h-8 w-8"
            @click="handleSubmit"
          >
            <Send class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
