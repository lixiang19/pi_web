<script setup lang="ts">
import { MoonStar, Palette, SunMedium, Monitor, Sparkles, Bell, PanelLeftClose, Languages } from "lucide-vue-next";
import type { AcceptableValue } from "reka-ui";
import { themeOptions, type ThemeName } from "@/assets/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useThemePreferences } from "@/composables/useThemePreferences";
import type { ThemeMode } from "@/stores/settings";
import { useSettingsStore } from "@/stores/settings";

const { mode, setMode, setTheme, themeName } = useThemePreferences();
const settingsStore = useSettingsStore();

const modeOptions: Array<{
  label: string;
  value: Exclude<ThemeMode, "system">;
  icon: typeof SunMedium;
  desc: string;
}> = [
  { label: "浅色", value: "light", icon: SunMedium, desc: "明亮的日间模式" },
  { label: "深色", value: "dark", icon: MoonStar, desc: "护眼的夜间模式" },
];

const handleThemeChange = (value: AcceptableValue) => {
  if (typeof value === "string") {
    setTheme(value as ThemeName);
  }
};

const handleNotificationsChange = async (checked: boolean) => {
  await settingsStore.setNotifications(checked);
};

// 主题色块预览映射
const themePreviewColors: Record<string, string> = {
  ridge: "#e07a5f",
  default: "#6366f1",
  amber: "#d97706",
  amethyst: "#7c3aed",
  bubblegum: "#ec4899",
  caffeine: "#78350f",
  northernLights: "#059669",
  pastelDreams: "#a78bfa",
};
</script>

<template>
  <div class="h-full overflow-auto bg-background">
    <div class="mx-auto max-w-2xl px-6 py-10">
      <!-- 页面标题 -->
      <div class="mb-10">
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">设置</h1>
        <p class="mt-2 text-sm text-muted-foreground">管理你的 ridge 工作台偏好。</p>
      </div>

      <!-- ========== 外观 ========== -->
      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Palette class="size-3.5" />
          外观
        </div>

        <!-- 主题选择 -->
        <Card class="mb-3">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-medium">颜色主题</CardTitle>
          </CardHeader>
          <CardContent>
            <Select :model-value="themeName" @update:model-value="handleThemeChange">
              <SelectTrigger class="w-full">
                <div class="flex items-center gap-2.5">
                  <span
                    class="inline-block size-3 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                    :style="{ backgroundColor: themePreviewColors[themeName] ?? '#888' }"
                  />
                  <SelectValue placeholder="选择主题" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="theme in themeOptions"
                  :key="theme.value"
                  :value="theme.value"
                >
                  <div class="flex items-center gap-2.5">
                    <span
                      class="inline-block size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                      :style="{ backgroundColor: themePreviewColors[theme.value] ?? '#888' }"
                    />
                    {{ theme.label }}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <!-- 明暗模式 -->
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-medium">显示模式</CardTitle>
          </CardHeader>
          <CardContent class="grid grid-cols-2 gap-3">
            <button
              v-for="option in modeOptions"
              :key="option.value"
              class="group flex items-center gap-3 rounded-lg border p-3.5 text-left transition-all duration-150"
              :class="
                mode === option.value
                  ? 'border-primary/50 bg-primary/8 text-foreground shadow-sm'
                  : 'border-border/60 bg-card text-foreground/80 hover:border-border hover:bg-muted/50'
              "
              @click="setMode(option.value)"
            >
              <div
                class="flex size-8 items-center justify-center rounded-md transition-colors"
                :class="mode === option.value ? 'bg-primary/15' : 'bg-muted'"
              >
                <component
                  :is="option.icon"
                  class="size-4 transition-colors"
                  :class="mode === option.value ? 'text-primary' : 'text-muted-foreground'"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium leading-tight">{{ option.label }}</div>
                <div class="mt-0.5 text-[11px] text-muted-foreground">{{ option.desc }}</div>
              </div>
            </button>
          </CardContent>
        </Card>
      </section>

      <Separator class="my-8" />

      <!-- ========== 偏好 ========== -->
      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Sparkles class="size-3.5" />
          偏好
        </div>

        <Card>
          <CardContent class="divide-y divide-border/60 p-0">
            <!-- 通知 -->
            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Bell class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">通知</div>
                  <div class="text-[11px] text-muted-foreground">接收工作台消息提醒</div>
                </div>
              </div>
              <Switch
                :checked="settingsStore.notifications"
                @update:checked="handleNotificationsChange"
              />
            </div>

            <!-- 侧边栏折叠 -->
            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <PanelLeftClose class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">折叠侧边栏</div>
                  <div class="text-[11px] text-muted-foreground">默认收起左侧导航</div>
                </div>
              </div>
              <Switch
                :checked="settingsStore.sidebarCollapsed"
                @update:checked="(v: boolean) => settingsStore.setSidebarCollapsed(v)"
              />
            </div>

            <!-- 语言 -->
            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Languages class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">语言</div>
                  <div class="text-[11px] text-muted-foreground">界面显示语言</div>
                </div>
              </div>
              <Select
                :model-value="settingsStore.language"
                @update:model-value="(v: string) => settingsStore.setLanguage(v)"
              >
                <SelectTrigger class="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator class="my-8" />

      <!-- ========== 关于 ========== -->
      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Monitor class="size-3.5" />
          关于
        </div>

        <Card>
          <CardContent class="px-5 py-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">ridge</div>
              <div class="text-xs text-muted-foreground">v0.1.0</div>
            </div>
            <p class="mt-1.5 text-[11px] text-muted-foreground">你的 AI 工作平台</p>
          </CardContent>
        </Card>
      </section>
    </div>
  </div>
</template>
