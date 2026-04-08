<script setup lang="ts">
import { cn } from "@/lib/utils";

interface Props {
  collapsed: boolean;
  title?: string;
  logoText?: string;
}

const { collapsed, title = "Pi Platform", logoText = "PI" } = defineProps<Props>();

const logoClasses =
  "flex size-6 shrink-0 items-center justify-center bg-primary text-primary-foreground font-semibold text-xs rounded";

const titleClasses =
  "whitespace-nowrap font-semibold text-sm text-sidebar-foreground transition-all duration-150";
</script>

<template>
  <div class="flex h-11 items-center px-3 border-b border-sidebar-border/50">
    <div class="flex items-center gap-2.5 overflow-hidden">
      <!-- Logo Icon -->
      <div :class="cn(logoClasses)">
        {{ logoText }}
      </div>

      <!-- Title with fade animation -->
      <span
        :class="
          cn(
            titleClasses,
            collapsed
              ? 'opacity-0 w-0 translate-x-1'
              : 'opacity-100 w-auto translate-x-0',
          )
        "
      >
        {{ title }}
      </span>
    </div>
  </div>
</template>
