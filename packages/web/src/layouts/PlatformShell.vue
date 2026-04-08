<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings2,
  Brush,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

import { cn } from "@/lib/utils";


const route = useRoute();

const isCollapsed = ref(false);

const navItems = [
  {
    name: "workbench",
    label: "工作台",
    to: "/",
    icon: LayoutDashboard,
  },
  {
    name: "design",
    label: "界面设计",
    to: "/design",
    icon: Brush,
  },
  {
    name: "settings",
    label: "设置",
    to: "/settings",
    icon: Settings2,
  },
];



const isNavItemActive = (name: string) => route.name === name;
const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden bg-background text-foreground">
    <!-- Sidebar -->
    <aside
      :class="cn(
        'group relative flex flex-col border-r bg-sidebar border-sidebar-border transition-all duration-200 ease-in-out',
        isCollapsed ? 'w-14' : 'w-56',
      )"
    >
      <!-- Logo -->
      <div class="flex h-12 items-center px-3">
        <div class="flex items-center gap-2.5 overflow-hidden">
          <div class="flex size-7 shrink-0 items-center justify-center bg-primary text-primary-foreground font-semibold text-xs rounded">
            PI
          </div>
          <span
            v-if="!isCollapsed"
            class="whitespace-nowrap font-semibold text-sm text-sidebar-foreground"
          >
            Pi Platform
          </span>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-2 py-3 space-y-0.5">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          :class="cn(
            'group relative flex items-center gap-2.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors',
            isNavItemActive(item.name)
              ? 'bg-sidebar-accent text-sidebar-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            isCollapsed && 'justify-center px-0'
          )"
          :title="isCollapsed ? item.label : ''"
        >
          <!-- Active Indicator -->
          <div
            v-if="isNavItemActive(item.name) && !isCollapsed"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full"
          />
          <component :is="item.icon" class="size-4 shrink-0" />
          <span v-if="!isCollapsed" class="whitespace-nowrap">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- Sidebar Footer -->
      <div class="p-2 border-t border-sidebar-border">
        <button
          class="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors rounded-md"
          :class="isCollapsed && 'justify-center px-0'"
          @click="toggleSidebar"
        >
          <component :is="isCollapsed ? ChevronRight : ChevronLeft" class="size-4 shrink-0" />
          <span v-if="!isCollapsed">{{ isCollapsed ? '展开' : '收起' }}</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex flex-1 flex-col overflow-hidden">
      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <div class="h-full">
          <RouterView />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 10px;
}
</style>