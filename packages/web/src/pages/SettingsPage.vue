<script setup lang="ts">
import { MoonStar, Palette, SunMedium } from "lucide-vue-next";
import { ref, computed } from "vue";

import { themeOptions, type ThemeName } from "@/assets/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThemePreferences } from "@/composables/useThemePreferences";
import type { ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

// 侧边栏菜单项
type MenuItem = {
  id: string;
  label: string;
  icon: typeof Palette;
};

const menuItems: MenuItem[] = [
  { id: "appearance", label: "外观", icon: Palette },
];

const activeMenuId = ref("appearance");

const {
  mode,
  setMode,
  setTheme,
  themeName,
} = useThemePreferences();

const modeOptions: Array<{ label: string; value: ThemeMode; icon: typeof SunMedium }> = [
  { label: "浅色", value: "light", icon: SunMedium },
  { label: "深色", value: "dark", icon: MoonStar },
];

const activeMenuItem = computed(() =>
  menuItems.find((item) => item.id === activeMenuId.value)
);

const handleThemeChange = (value: string | null) => {
  if (value) setTheme(value as ThemeName);
};

const handleModeChange = (value: string | null) => {
  if (value) setMode(value as ThemeMode);
};
</script>

<template>
  <div class="flex h-full">
    <!-- Sidebar -->
    <aside class="w-56 border-r bg-sidebar border-sidebar-border flex flex-col shrink-0">
      <div class="p-4 border-b border-sidebar-border">
        <h2 class="font-semibold text-sidebar-foreground">设置</h2>
      </div>
      <nav class="flex-1 p-2 space-y-0.5">
        <button
          v-for="item in menuItems"
          :key="item.id"
          type="button"
          :class="cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium rounded-md transition-colors relative',
            activeMenuId === item.id
              ? 'bg-sidebar-accent text-sidebar-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          )"
          @click="activeMenuId = item.id"
        >
          <!-- Active Indicator -->
          <div
            v-if="activeMenuId === item.id"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full"
          />
          <component :is="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-xl mx-auto p-8 space-y-6">
        <!-- Header -->
        <div class="space-y-1">
          <h1 class="text-xl font-semibold tracking-tight">{{ activeMenuItem?.label }}</h1>
          <p class="text-sm text-muted-foreground">
            自定义工作台的外观和视觉风格
          </p>
        </div>

        <!-- Appearance Settings -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-base font-medium">外观设置</CardTitle>
          </CardHeader>
          <CardContent class="space-y-5">
            <!-- Theme Select -->
            <div class="space-y-2">
              <label class="text-sm font-medium">主题</label>
              <Select :value="themeName" @update:model-value="handleThemeChange">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="选择主题" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="theme in themeOptions"
                    :key="theme.value"
                    :value="theme.value"
                  >
                    {{ theme.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Mode Select -->
            <div class="space-y-2">
              <label class="text-sm font-medium">模式</label>
              <Select :value="mode" @update:model-value="handleModeChange">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="选择模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in modeOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    <div class="flex items-center gap-2">
                      <component :is="option.icon" class="size-4" />
                      {{ option.label }}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>
