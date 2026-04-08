<script setup lang="ts">
import { SendHorizontal, Slash, Square } from "lucide-vue-next";
import { computed } from "vue";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import WorkbenchResourcePicker from "@/components/workbench/chat/WorkbenchResourcePicker.vue";
import type {
  CommandCatalogItem,
  PromptCatalogItem,
  SkillCatalogItem,
} from "@/lib/types";

const props = defineProps<{
  commands: CommandCatalogItem[];
  hasVisibleResources: boolean;
  isResourcePickerVisible: boolean;
  isSending: boolean;
  prompts: PromptCatalogItem[];
  resourceError: string;
  skills: SkillCatalogItem[];
  value: string;
}>();

const emit = defineEmits<{
  applyPrompt: [PromptCatalogItem];
  injectCommand: [string];
  injectSkill: [string];
  submit: [];
  toggleResourcePicker: [];
  "update:value": [string];
}>();

const draftText = computed({
  get: () => props.value,
  set: (value: string) => emit("update:value", value),
});
</script>

<template>
  <div class="shrink-0 border-t border-border bg-background px-4 py-3">
    <div class="mx-auto max-w-3xl">
      <div class="relative">
        <Textarea
          v-model="draftText"
          placeholder="Type a message..."
          class="min-h-[80px] resize-none rounded-lg border bg-muted/50 px-4 py-3 pr-12 text-sm focus-visible:ring-1"
          @keydown.enter.prevent="emit('submit')"
        />
        <div class="absolute bottom-2 right-2 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            class="size-8 rounded-lg text-muted-foreground hover:text-foreground"
            @click="emit('toggleResourcePicker')"
          >
            <Slash class="size-4" />
          </Button>
          <Button
            size="icon"
            class="size-8 rounded-lg"
            :disabled="isSending || !value.trim()"
            @click="emit('submit')"
          >
            <Square v-if="isSending" class="size-4 fill-current" />
            <SendHorizontal v-else class="size-4" />
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