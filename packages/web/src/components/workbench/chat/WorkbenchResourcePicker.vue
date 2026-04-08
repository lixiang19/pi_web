<script setup lang="ts">
import { Slash, Sparkles, Wrench, AlertCircle } from "lucide-vue-next";
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
    class="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-lg border border-border bg-popover/95 shadow-lg backdrop-blur"
  >
    <ScrollArea class="max-h-[320px]">
      <div class="space-y-1 p-2">
        <div
          v-if="commands.length"
          class="px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          Commands
        </div>
        <button
          v-for="command in commands"
          :key="command.name"
          class="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
          @click="emit('injectCommand', command.name)"
        >
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          >
            <Slash class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">
              /{{ command.name }}
            </div>
            <div class="truncate text-xs text-muted-foreground">
              {{ command.description }}
            </div>
          </div>
        </button>
        <div
          v-if="prompts.length"
          class="px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          Prompts
        </div>
        <button
          v-for="prompt in prompts"
          :key="prompt.name"
          class="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
          @click="emit('applyPrompt', prompt)"
        >
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          >
            <Sparkles class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">
              {{ prompt.name }}
            </div>
            <div class="truncate text-xs text-muted-foreground">
              {{ prompt.description }}
            </div>
          </div>
        </button>
        <div
          v-if="skills.length"
          class="px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          Skills
        </div>
        <button
          v-for="skill in skills"
          :key="skill.name"
          class="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
          @click="emit('injectSkill', skill.invocation)"
        >
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          >
            <Wrench class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">
              {{ skill.name }}
            </div>
            <div class="truncate text-xs text-muted-foreground">
              {{ skill.description }}
            </div>
          </div>
        </button>
        <div v-if="resourceError" class="rounded-md border-destructive/20 bg-destructive/10 px-3 py-2">
          <div class="mb-1 flex items-center gap-2 text-xs font-medium text-destructive">
            <AlertCircle class="size-3" />
            Resource Error
          </div>
          <p class="text-xs text-destructive/80">
            {{ resourceError }}
          </p>
        </div>
        <div v-if="!hasVisibleResources" class="py-8 text-center">
          <p class="text-xs text-muted-foreground">
            No matching resources
          </p>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>