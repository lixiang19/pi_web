<script setup lang="ts">
import {
  Bot,
  Brain,
  Lightbulb,
  SendHorizontal,
  Slash,
  Square,
} from "lucide-vue-next";
import { computed } from "vue";
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
        <Textarea
          v-model="draftText"
          placeholder="Type a message..."
          class="min-h-[80px] resize-none rounded-lg border bg-muted/30 px-3 py-3 pr-12 text-sm leading-6 focus-visible:ring-1 focus-visible:ring-ring/30"
          @keydown.enter.prevent="emit('submit')"
        />
        <!-- 发送按钮 -->
        <div class="absolute bottom-2.5 right-2.5">
          <Button
            size="icon"
            class="size-8 rounded-md"
            :disabled="isSending || !value.trim()"
            @click="emit('submit')"
          >
            <Square v-if="isSending" class="size-4 fill-current" />
            <SendHorizontal v-else class="size-4" />
          </Button>
        </div>
      </div>
      <!-- 底部工具栏 -->
      <div class="mt-2 flex items-center justify-between">
        <!-- 左侧：选项选择器 -->
        <div class="flex items-center gap-1">
          <!-- 模型选择器 -->
          <Select
            :model-value="composer.selectedModel || autoModelValue"
            @update:model-value="emit('selectModel', $event)"
          >
            <SelectTrigger
              size="sm"
              class="h-6 gap-1 border-0 bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Brain class="size-3.5 shrink-0" />
              <SelectValue :placeholder="currentModelLabel" />
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
              class="h-6 gap-1 border-0 bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Lightbulb class="size-3.5 shrink-0" />
              <SelectValue :placeholder="currentThinkingLabel" />
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
              class="h-6 max-w-[120px] gap-1 border-0 bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Bot class="size-3.5 shrink-0" />
              <span class="truncate">{{ currentAgentLabel }}</span>
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
          class="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          @click="emit('toggleResourcePicker')"
        >
          <Slash class="size-3.5" />
          <span>Resources</span>
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
