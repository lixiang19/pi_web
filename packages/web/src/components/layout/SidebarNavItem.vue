<script setup lang="ts">
import { RouterLink } from "vue-router";
import { cn } from "@/lib/utils";
import type { Component } from "vue";

export interface NavItem {
  name: string;
  label: string;
  to: string;
  icon: Component;
}

interface Props {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}

const props = defineProps<Props>();

// Linear 风格：简洁、细边框、微妙过渡
const baseClasses =
  "group relative flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors duration-200";

const stateClasses = {
  active: "bg-sidebar-accent text-sidebar-foreground",
  inactive:
    "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
};

const layoutClasses = {
  default: "px-2.5 py-1.5",
  collapsed: "justify-center px-0 py-1.5",
};

const iconClasses = {
  active: "text-sidebar-foreground",
  inactive: "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
};
</script>

<template>
  <RouterLink
    :to="props.item.to"
    :class="
      cn(
        baseClasses,
        props.active ? stateClasses.active : stateClasses.inactive,
        props.collapsed ? layoutClasses.collapsed : layoutClasses.default,
      )
    "
    :title="props.collapsed ? props.item.label : ''"
  >
    <!-- Active Indicator - Linear 风格左边缘指示器 -->
    <div
      :class="
        cn(
          'absolute left-px top-1/2 -translate-y-1/2 w-0.5 bg-primary/80 rounded-full transition-all duration-200',
          props.active ? 'h-4 opacity-100' : 'h-0 opacity-0',
        )
      "
    />

    <!-- Icon -->
    <component
      :is="props.item.icon"
      :class="
        cn(
          'size-4 shrink-0 transition-colors duration-200',
          props.active ? iconClasses.active : iconClasses.inactive,
        )
      "
    />

    <!-- Label -->
    <span
      v-if="!props.collapsed"
      class="whitespace-nowrap transition-opacity duration-200"
    >
      {{ props.item.label }}
    </span>
  </RouterLink>
</template>
