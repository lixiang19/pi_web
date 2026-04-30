<script setup lang="ts">
import { computed } from "vue";
import TerminalViewport from "@/components/terminal/TerminalViewport.vue";
import { useTerminalPool } from "@/composables/useTerminalPool";
import type { TerminalSnapshot } from "@/lib/types";

const props = defineProps<{
  terminalId: string;
}>();

const terminalPool = useTerminalPool();

const terminal = computed<TerminalSnapshot | null>(
  () =>
    terminalPool.terminals.value.find((t) => t.id === props.terminalId) ?? null,
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <section class="min-h-0 flex-1">
      <div class="grid h-full min-h-0">
        <div
          v-if="!terminal"
          class="flex items-center justify-center text-sm text-muted-foreground"
        >
          终端未就绪
        </div>

        <TerminalViewport
          v-else
          :terminal="terminal"
          :autofocus="true"
        />
      </div>
    </section>
  </div>
</template>
