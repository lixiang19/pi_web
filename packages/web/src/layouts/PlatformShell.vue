<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings2,
  Brush,
} from "lucide-vue-next";
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";

import { SidebarLogo, SidebarNavItem } from "@/components/layout";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/layout";

const route = useRoute();
const settings = useSettingsStore();

const isCollapsed = computed(() => settings.sidebarCollapsed);
const toggleLabel = computed(() => isCollapsed.value ? "展开" : "收起");
const ToggleIcon = computed(() => isCollapsed.value ? ChevronRight : ChevronLeft);

const isNavItemActive = (name: string) => route.name === name;

// 样式常量提取 - Linear 风格：150ms 微妙过渡
const sidebarBase = "group relative flex flex-col border-r bg-sidebar border-sidebar-border transition-all duration-150 ease-out";
const sidebarWidth = computed(() => isCollapsed.value ? "w-14" : "w-56");

const toggleBtnBase = "flex w-full items-center gap-2.5 rounded-md text-xs font-medium transition-colors duration-150";
const toggleBtnState = "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50";
const toggleBtnLayout = computed(() => isCollapsed.value ? "justify-center px-0 py-1.5" : "px-2.5 py-1.5");

// 静态配置
const NAV_ITEMS: NavItem[] = [
  { name: "workbench", label: "工作台", to: "/", icon: LayoutDashboard },
  { name: "design", label: "界面设计", to: "/design", icon: Brush },
  { name: "settings", label: "设置", to: "/settings", icon: Settings2 },
];
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden bg-background text-foreground">
    <!-- Sidebar -->
    <aside :class="cn(sidebarBase, sidebarWidth)">
      <!-- Logo -->
      <SidebarLogo :collapsed="isCollapsed" />

      <!-- Navigation -->
      <nav class="flex-1 px-2 py-3 space-y-0.5">
        <SidebarNavItem
          v-for="item in NAV_ITEMS"
          :key="item.name"
          :item="item"
          :active="isNavItemActive(item.name)"
          :collapsed="isCollapsed"
        />
      </nav>

      <!-- Sidebar Footer -->
      <div class="p-2 border-t border-sidebar-border">
        <button
          :class="cn(toggleBtnBase, toggleBtnState, toggleBtnLayout)"
          :title="isCollapsed ? toggleLabel : ''"
          @click="settings.toggleSidebar"
        >
          <ToggleIcon class="size-4 shrink-0" />
          <span 
            v-if="!isCollapsed" 
            class="whitespace-nowrap"
          >
            {{ toggleLabel }}
          </span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex flex-1 flex-col overflow-hidden">
      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <div class="h-full">
          <RouterView />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* 滚动条样式优化 */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

.scrollbar-thin::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: hsl(var(--border) / 0.6);
  border-radius: 10px;
  transition: background 0.2s ease;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--border));
}

.scrollbar-thin::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
