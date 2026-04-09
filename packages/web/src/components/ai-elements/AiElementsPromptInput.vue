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
  <div class="border-t bg-background p-4">
    <PromptInput class="flex flex-col gap-2">
      <!-- Text Input -->
      <PromptInputTextarea
        v-model="inputText"
        :disabled="disabled || isSending"
        :placeholder="disabled ? 'Select a session to start chatting...' : 'Type a message... (Shift+Enter for new line)'"
        class="min-h-[80px] resize-none"
        @keydown="handleKeydown"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />

      <!-- Footer with controls -->
      <PromptInputFooter class="flex items-center justify-between">
        <!-- Left: Model/Thinking/Agent selectors -->
        <PromptInputTools class="flex items-center gap-2">
          <!-- Model Selector -->
          <Select
            :value="selectedModel"
            @update:value="emit('update:selectedModel', $event)"
            :disabled="isSending"
          >
            <SelectTrigger class="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Auto</SelectItem>
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
            <SelectTrigger class="w-[100px] h-8 text-xs">
              <SelectValue placeholder="Thinking" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Auto</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>

          <!-- Agent Selector -->
          <Select
            :value="selectedAgent"
            @update:value="emit('update:selectedAgent', $event)"
            :disabled="isSending"
          >
            <SelectTrigger class="w-[120px] h-8 text-xs">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No Agent</SelectItem>
              <SelectItem value="coder">Coder</SelectItem>
              <SelectItem value="reviewer">Reviewer</SelectItem>
            </SelectContent>
          </Select>
        </PromptInputTools>

        <!-- Right: Submit/Abort button -->
        <div class="flex items-center gap-2">
          <PromptInputSubmit as-child>
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
          </PromptInputSubmit>
        </div>
      </PromptInputFooter>
    </PromptInput>
  </div>
</template>
