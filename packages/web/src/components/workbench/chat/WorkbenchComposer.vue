<script setup lang="ts">
import { Command, SendHorizontal, Slash, Square } from "lucide-vue-next";
import { computed } from "vue";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  <div class="border-t border-white/5 bg-black/40 p-4 sm:p-8">
    <div class="relative mx-auto max-w-4xl">
      <div
        class="flex flex-col gap-2 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-2 shadow-2xl transition-all duration-500 focus-within:border-amber-500/30"
      >
        <Textarea
          v-model="draftText"
          placeholder="Describe your objective..."
          class="min-h-[120px] resize-none border-0 bg-transparent p-4 text-base font-medium placeholder:text-stone-600 focus-visible:ring-0"
          @keydown.enter.prevent="emit('submit')"
        />

        <div class="flex items-center justify-between px-3 pb-2">
          <div class="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              class="size-10 rounded-2xl text-stone-500 transition-all hover:bg-amber-400/10 hover:text-amber-400"
              @click="emit('toggleResourcePicker')"
            >
              <Slash class="size-5" />
            </Button>
            <Separator orientation="vertical" class="h-5 bg-white/10" />
            <div
              class="hidden items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-stone-400 sm:flex"
            >
              <Command class="size-3" />
              Enter
            </div>
          </div>

          <Button
            size="icon"
            class="size-12 rounded-2xl bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:scale-105 hover:bg-amber-400 active:scale-95 disabled:scale-100 disabled:grayscale disabled:opacity-30"
            :disabled="isSending || !value.trim()"
            @click="emit('submit')"
          >
            <Square v-if="isSending" class="size-5 fill-current" />
            <SendHorizontal v-else class="size-6" />
          </Button>
        </div>
      </div>

      <transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-y-4 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-4 opacity-0"
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