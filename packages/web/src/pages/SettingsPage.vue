<script setup lang="ts">
import { MoonStar, Palette, SunMedium } from "lucide-vue-next";
import type { AcceptableValue } from "reka-ui";
import { computed } from "vue";
import { themeOptions, type ThemeName } from "@/assets/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThemePreferences } from "@/composables/useThemePreferences";
import type { ThemeMode } from "@/stores/settings";

const { mode, setMode, setTheme, themeName } = useThemePreferences();

const modeOptions: Array<{
  label: string;
  value: Exclude<ThemeMode, "system">;
  icon: typeof SunMedium;
}> = [
  { label: "浅色", value: "light", icon: SunMedium },
  { label: "深色", value: "dark", icon: MoonStar },
];

const modeDescription = computed(() =>
  mode.value === "dark" ? "当前使用深色模式" : "当前使用浅色模式",
);

const handleThemeChange = (value: AcceptableValue) => {
  if (typeof value === "string") {
    setTheme(value as ThemeName);
  }
};
</script>

<template>
  <div class="h-full overflow-auto bg-background">
    <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <section class="rounded-3xl border border-border/70 bg-card/70 p-8 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
          Settings
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <h1 class="text-3xl font-semibold tracking-tight text-foreground">系统设置</h1>
          <Badge variant="secondary">{{ modeDescription }}</Badge>
        </div>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          设置已经收敛到统一主路由，不再带内部侧栏和返回工作台入口。当前页面只负责配置本身。
        </p>
      </section>

      <section class="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card class="border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <Palette class="size-4 text-primary/70" />
              颜色主题
            </CardTitle>
            <CardDescription>选择 ridge 工作台的视觉主题。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <Select :model-value="themeName" @update:model-value="handleThemeChange">
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
            <p class="text-sm leading-7 text-muted-foreground">
              主题选择会直接持久化到 ridge 设置中，并同步整个工作台外观。
            </p>
          </CardContent>
        </Card>

        <Card class="border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <SunMedium class="size-4 text-primary/70" />
              显示模式
            </CardTitle>
            <CardDescription>切换浅色和深色显示模式。</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-3 sm:grid-cols-2">
            <Button
              v-for="option in modeOptions"
              :key="option.value"
              variant="outline"
              class="h-11 justify-start gap-2"
              :class="mode === option.value ? 'border-primary bg-primary/10 text-primary' : ''"
              @click="setMode(option.value)"
            >
              <component :is="option.icon" class="size-4" />
              {{ option.label }}
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card class="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle class="text-base">本次收口结果</CardTitle>
          <CardDescription>设置已经成为左侧统一导航里的一级路由。</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm leading-7 text-foreground/85">
            不再维护旧设置专用侧栏。
          </div>
          <div class="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm leading-7 text-foreground/85">
            主题与模式能力保持原样可用。
          </div>
          <div class="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm leading-7 text-foreground/85">
            后续 provider、agent 等配置可继续在这个路由扩展。
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
