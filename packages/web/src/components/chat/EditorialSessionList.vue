<script setup lang="ts">
import { Pin } from "lucide-vue-next";

type Session = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  pinned?: boolean;
  tag: "research" | "ui" | "agent" | "spec";
};

defineProps<{
  sessions: Session[];
  activeId: string;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
}>();

const tagToneMap: Record<Session["tag"], string> = {
  research: "bg-[#ecebe7] text-[#44403c]",
  ui: "bg-[#f1f1ef] text-[#57534e]",
  agent: "bg-[#f3f0ff] text-[#5b21b6]",
  spec: "bg-[#edf4ff] text-[#1d4ed8]",
};
</script>

<template>
  <div class="flex flex-col gap-1 px-3">
    <button
      v-for="session in sessions"
      :key="session.id"
      type="button"
      class="group relative flex w-full flex-col gap-1.5 rounded-lg px-4 py-3 text-left transition-all duration-200"
      :class="
        activeId === session.id
          ? 'bg-[#f1f1ef] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)]'
          : 'bg-transparent hover:bg-[#f8f7f5]'
      "
      @click="emit('select', session.id)"
    >
      <!-- Active Indicator (Minimal Dot) -->
      <div 
        v-if="activeId === session.id"
        class="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-4 bg-[#191919] rounded-full"
      />

      <div class="flex items-start justify-between gap-2">
        <h3 
          class="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight text-[#191919]"
          :class="{ 'opacity-100': activeId === session.id, 'opacity-80 transition-opacity group-hover:opacity-100': activeId !== session.id }"
        >
          {{ session.title }}
        </h3>
        <Pin v-if="session.pinned" class="size-3 mt-1 shrink-0 text-[#a8a29e]" />
      </div>

      <p 
        class="line-clamp-2 text-[12px] leading-[1.6] text-[#78716c]"
        :class="{ 'text-[#57534e] transition-colors group-hover:text-[#44403c]': activeId !== session.id }"
      >
        {{ session.preview }}
      </p>

      <div class="mt-1 flex items-center gap-2">
        <span 
          class="inline-flex rounded-md border border-black/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          :class="tagToneMap[session.tag]"
        >
          {{ session.tag }}
        </span>
        <span class="text-[10px] font-medium text-[#a8a29e] uppercase tracking-wide italic">
          {{ session.updatedAt }}
        </span>
      </div>
    </button>
  </div>
</template>

<style scoped>
/* 极致排版控制 */
h3 {
  font-variant-numeric: tabular-nums;
}
</style>
