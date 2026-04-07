<script setup lang="ts">
import { Command, Slash, Sparkles, Wrench } from "lucide-vue-next";

import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  CommandCatalogItem,
  PromptCatalogItem,
  SkillCatalogItem,
} from "@/lib/types";

defineProps<{
  commands: CommandCatalogItem[];
  hasVisibleResources: boolean;
  prompts: PromptCatalogItem[];
  resourceError: string;
  skills: SkillCatalogItem[];
}>();

const emit = defineEmits<{
  applyPrompt: [prompt: PromptCatalogItem];
  injectCommand: [commandName: string];
  injectSkill: [invocation: string];
}>();
</script>

<template>
  <div
    class="absolute bottom-full left-0 right-0 z-50 mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-[#0c0c0e]/95 shadow-[0_20px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
  >
    <ScrollArea class="max-h-[420px]">
      <div class="space-y-2 p-3">
        <div
          v-if="commands.length"
          class="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 opacity-60"
        >
          System Commands
        </div>
        <button
          v-for="command in commands"
          :key="command.name"
          class="group flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all hover:bg-white/5 active:scale-[0.98]"
          @click="emit('injectCommand', command.name)"
        >
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-stone-500 transition-all group-hover:bg-amber-500/10 group-hover:text-amber-400"
          >
            <Slash class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-stone-200 transition-colors group-hover:text-white">
              /{{ command.name }}
            </div>
            <div class="truncate text-xs font-medium text-stone-500 transition-colors group-hover:text-stone-400">
              {{ command.description }}
            </div>
          </div>
        </button>

        <div
          v-if="prompts.length"
          class="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 opacity-60"
        >
          Intelligent Prompts
        </div>
        <button
          v-for="prompt in prompts"
          :key="prompt.name"
          class="group flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all hover:bg-white/5 active:scale-[0.98]"
          @click="emit('applyPrompt', prompt)"
        >
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-stone-500 transition-all group-hover:bg-emerald-500/10 group-hover:text-emerald-400"
          >
            <Sparkles class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-stone-200 transition-colors group-hover:text-white">
              {{ prompt.name }}
            </div>
            <div class="truncate text-xs font-medium text-stone-500 transition-colors group-hover:text-stone-400">
              {{ prompt.description }}
            </div>
          </div>
        </button>

        <div
          v-if="skills.length"
          class="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-sky-500 opacity-60"
        >
          Skills
        </div>
        <button
          v-for="skill in skills"
          :key="skill.name"
          class="group flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all hover:bg-white/5 active:scale-[0.98]"
          @click="emit('injectSkill', skill.invocation)"
        >
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-stone-500 transition-all group-hover:bg-sky-500/10 group-hover:text-sky-400"
          >
            <Wrench class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-stone-200 transition-colors group-hover:text-white">
              {{ skill.name }}
            </div>
            <div class="truncate text-xs font-medium text-stone-500 transition-colors group-hover:text-stone-400">
              {{ skill.description }}
            </div>
          </div>
        </button>

        <div v-if="resourceError" class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4">
          <div class="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
            <Command class="size-3" />
            Resource Diagnostics
          </div>
          <p class="text-xs leading-6 text-amber-100/90">
            资源目录异常：{{ resourceError }}
          </p>
        </div>

        <div v-if="!hasVisibleResources" class="py-12 text-center">
          <p class="text-[11px] font-bold uppercase tracking-widest text-stone-600">
            No matching protocols
          </p>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>