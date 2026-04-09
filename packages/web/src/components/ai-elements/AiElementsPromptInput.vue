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
import { Send, Square } from "lucide-vue-next";

// Import ai-elements-vue prompt-input components
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
} from "./prompt-input";

interface Props {
  sessionId: string | null;
  disabled?: boolean;
  isSending?: boolean;
  canAbort?: boolean;
  selectedModel?: string;
  selectedThinkingLevel?: string;
  selectedAgent?: string;
  draftText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  isSending: false,
  canAbort: false,
  selectedModel: "",
  selectedThinkingLevel: "",
  selectedAgent: "",
  draftText: "",
});

const emit = defineEmits<{
  submit: [text: string, options: SubmitOptions];
  abort: [];
  update:draft: [text: string];
  update:selectedModel: [model: string];
  update:selectedThinkingLevel: [level: string];
  update:selectedAgent: [agent: string];
}>();

interface SubmitOptions {
  model?: string;
  thinkingLevel?: string;
  agent?: string;
}

const inputText = ref(props.draftText);
const isFocused = ref(false);

// Sync with prop changes
watch(() => props.draftText, (newText) => {
  if (newText !== inputText.value) {
    inputText.value = newText;
  }
});

// Emit draft updates
watch(inputText, (newText) => {
  emit("update:draft", newText);
});

const canSubmit = computed(() => {
  return inputText.value.trim().length > 0 && !props.isSending && !props.disabled;
});

const handleSubmit = () => {
  if (!canSubmit.value) return;

  const text = inputText.value.trim();
  const options: SubmitOptions = {
    model: props.selectedModel || undefined,
    thinkingLevel: props.selectedThinkingLevel || undefined,
    agent: props.selectedAgent || undefined,
  };

  emit("submit", text, options);
  inputText.value = "";
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
</script>

<template>
  <div class="border-t border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <PromptInput class="flex flex-col gap-3">
      <!-- Text Input -->
      <PromptInputTextarea
        v-model="inputText"
        :disabled="disabled || isSending"
        :placeholder="disabled ? '选择会话开始聊天...' : '输入消息... (Shift+Enter 换行)'"
        class="min-h-[80px] resize-none rounded-xl bg-muted/50 transition-colors focus:bg-background"
        :class="{ 'opacity-60': disabled }"
        aria-label="消息输入框"
        @keydown="handleKeydown"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />

      <!-- Footer with controls -->
      <PromptInputFooter class="flex items-center justify-between gap-4">
        <!-- Left: Model/Thinking/Agent selectors -->
        <PromptInputTools class="flex flex-wrap items-center gap-2">
          <!-- Model Selector -->
          <Select
            :value="selectedModel"
            @update:value="emit('update:selectedModel', $event)"
            :disabled="isSending"
          >
            <SelectTrigger
              class="h-8 w-auto min-w-[100px] gap-1 rounded-lg border-border/60 bg-background px-2.5 text-xs transition-colors hover:border-border hover:bg-accent"
              aria-label="选择模型"
            >
              <SelectValue placeholder="模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">自动</SelectItem>
              <SelectItem value="gpt-4">GPT-4</SelectItem>
              <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
              <SelectItem value="claude-3">Claude 3</SelectItem>
            </SelectContent>
          </Select>

          <!-- Thinking Level Selector -->
          <Select
            :value="selectedThinkingLevel"
            @update:value="emit('update:selectedThinkingLevel', $event)"
            :disabled="isSending"
          >
            <SelectTrigger
              class="h-8 w-auto min-w-[80px] gap-1 rounded-lg border-border/60 bg-background px-2.5 text-xs transition-colors hover:border-border hover:bg-accent"
              aria-label="选择思考深度"
            >
              <SelectValue placeholder="思考" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">自动</SelectItem>
              <SelectItem value="low">低</SelectItem>
              <SelectItem value="medium">中</SelectItem>
              <SelectItem value="high">高</SelectItem>
            </SelectContent>
          </Select>

          <!-- Agent Selector -->
          <Select
            :value="selectedAgent"
            @update:value="emit('update:selectedAgent', $event)"
            :disabled="isSending"
          >
            <SelectTrigger
              class="h-8 w-auto min-w-[90px] gap-1 rounded-lg border-border/60 bg-background px-2.5 text-xs transition-colors hover:border-border hover:bg-accent"
              aria-label="选择智能体"
            >
              <SelectValue placeholder="智能体" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">无智能体</SelectItem>
              <SelectItem value="coder">编码助手</SelectItem>
              <SelectItem value="reviewer">审查助手</SelectItem>
            </SelectContent>
          </Select>
        </PromptInputTools>

        <!-- Right: Submit/Abort button -->
        <div class="flex items-center gap-2">
          <span v-if="isSending" class="text-xs text-muted-foreground">
            发送中...
          </span>
          <PromptInputSubmit as-child>
            <Button
              v-if="canAbort"
              variant="destructive"
              size="icon"
              class="h-8 w-8 rounded-lg transition-all duration-150 hover:scale-105 active:scale-95"
              aria-label="停止生成"
              @click="handleAbort"
            >
              <Square class="h-4 w-4 fill-current" />
            </Button>
            <Button
              v-else
              :disabled="!canSubmit"
              size="icon"
              class="h-8 w-8 rounded-lg bg-primary text-primary-foreground transition-all duration-150 hover:scale-105 hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              aria-label="发送消息"
              @click="handleSubmit"
            >
              <Send class="h-4 w-4" />
            </Button>
          </PromptInputSubmit>
        </div>
      </PromptInputFooter>
    </PromptInput>
  </div>
</template>
