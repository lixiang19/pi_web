<script setup lang="ts">
import { MoonStar, Palette, SunMedium, ChevronRight, Home, Layers, Sparkles } from "lucide-vue-next";
import { ref, computed } from "vue";
import { useRouter } from "vue-router";

import { themeOptions, type ThemeName } from "@/assets/registry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useThemePreferences } from "@/composables/useThemePreferences";
import type { ThemeMode } from "@/stores/settings";

const router = useRouter();

// 侧边栏菜单项
type MenuItem = {
  id: string;
  label: string;
  icon: typeof Palette;
};

const menuItems: MenuItem[] = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "design", label: "设计风格", icon: Layers },
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

const goBack = () => {
  router.push({ name: "workbench" });
};

// ridge主题信息 - 山脊设计
const ridgeInfo = {
  title: "山脊 Terrain",
  description: "ridge专属设计灵感源自山脊意象：层次分明的色彩从山脚土壤到山顶暖阳，呈现自然的色彩过渡。珊瑚金强调色代表山顶暖阳，大地色系体现山岩与土壤的稳固感。",
  features: ["山脊层次", "珊瑚暖阳", "大地色系", "自然过渡"],
};
</script>

<template>
  <SidebarProvider class="flex h-svh overflow-hidden">
    <Sidebar variant="sidebar" collapsible="none" class="shrink-0 h-full">
      <SidebarHeader>
        <div class="flex items-center gap-2 px-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
            R
          </div>
          <span class="font-semibold">ridge</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <!-- 返回工作台 -->
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton @click="goBack">
                <Home class="size-4" />
                <span>返回工作台</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        <!-- 设置菜单 -->
        <SidebarGroup>
          <SidebarGroupLabel>设置</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in menuItems" :key="item.id">
              <SidebarMenuButton
                :is-active="activeMenuId === item.id"
                @click="activeMenuId = item.id"
              >
                <component :is="item.icon" class="size-4" />
                <span>{{ item.label }}</span>
                <ChevronRight class="ml-auto size-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p class="text-xs text-muted-foreground text-center">
          ridge v0.1.0
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>

    <SidebarInset class="p-6 overflow-y-auto min-w-0">
      <!-- Appearance Content -->
      <div v-if="activeMenuId === 'appearance'" class="max-w-2xl mx-auto min-w-0">
        <div class="space-y-6 pb-6">
          <!-- Section Header -->
          <div class="px-2">
            <h1 class="text-2xl font-semibold tracking-tight">
              {{ activeMenuItem?.label }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              自定义工作台的外观和视觉风格
            </p>
          </div>

          <!-- Settings Cards -->
          <div class="space-y-4">
            <!-- Theme Card -->
            <Card>
              <CardHeader>
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Palette class="size-4" />
                  </div>
                  <div>
                    <CardTitle class="text-base">颜色主题</CardTitle>
                    <CardDescription>选择适合您工作环境的配色方案</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Select :model-value="themeName" @update:model-value="handleThemeChange">
                  <SelectTrigger>
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
              </CardContent>
            </Card>

            <!-- Mode Card -->
            <Card>
              <CardHeader>
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <component :is="mode === 'dark' ? MoonStar : SunMedium" class="size-4" />
                  </div>
                  <div>
                    <CardTitle class="text-base">显示模式</CardTitle>
                    <CardDescription>切换浅色或深色显示模式</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div class="grid grid-cols-2 gap-3">
                  <Button
                    v-for="option in modeOptions"
                    :key="option.value"
                    variant="outline"
                    :class="{ 'border-primary bg-primary/10 text-primary': mode === option.value }"
                    @click="handleModeChange(option.value)"
                  >
                    <component :is="option.icon" class="size-4 mr-2" />
                    {{ option.label }}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Info Card -->
          <Card class="bg-muted/50">
            <CardContent class="pt-6">
              <p class="text-sm text-muted-foreground leading-relaxed">
                外观设置会自动保存并应用到所有工作区。深色模式适合在低光环境下使用，可以减轻眼睛疲劳。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- Design Preview Content -->
      <div v-else-if="activeMenuId === 'design'" class="max-w-3xl min-w-0">
        <div class="space-y-6 pb-6">
          <!-- Section Header -->
          <div class="px-2">
            <h1 class="text-2xl font-semibold tracking-tight">设计风格预览</h1>
            <p class="mt-1 text-sm text-muted-foreground">ridge专属风格预览 - 使用shadcn-vue组件库</p>
          </div>

          <!-- ridge Style Info Card -->
          <Card>
            <CardHeader>
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Sparkles class="size-5" />
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ridge Exclusive
                  </p>
                  <CardTitle>{{ ridgeInfo.title }}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription class="leading-relaxed">
                {{ ridgeInfo.description }}
              </CardDescription>
              <div class="mt-4 flex flex-wrap gap-2 min-w-0">
                <Badge v-for="feature in ridgeInfo.features" :key="feature" variant="secondary" class="shrink-0">
                  {{ feature }}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <!-- shadcn Component Showcase -->
          <Card>
            <CardHeader class="ridge-panel-header rounded-t-lg pb-6">
              <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span class="w-2 h-2 rounded-full bg-primary"></span>
                shadcn-vue 组件展示
              </div>
            </CardHeader>
            <CardContent class="pt-6 space-y-6">
              <!-- Button Variants -->
              <div class="space-y-3">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">Button 变体</div>
                <div class="flex flex-wrap gap-2 min-w-0">
                  <Button class="shrink-0">Default</Button>
                  <Button variant="secondary" class="shrink-0">Secondary</Button>
                  <Button variant="outline" class="shrink-0">Outline</Button>
                  <Button variant="ghost" class="shrink-0">Ghost</Button>
                  <Button variant="destructive" class="shrink-0">Destructive</Button>
                </div>
              </div>

              <Separator />

              <!-- Badge Variants -->
              <div class="space-y-3">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">Badge 变体</div>
                <div class="flex flex-wrap gap-2 min-w-0">
                  <Badge class="shrink-0">Default</Badge>
                  <Badge variant="secondary" class="shrink-0">Secondary</Badge>
                  <Badge variant="outline" class="shrink-0">Outline</Badge>
                  <Badge variant="destructive" class="shrink-0">Destructive</Badge>
                </div>
              </div>

              <Separator />

              <!-- Card Example -->
              <div class="space-y-3">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">Card 组件</div>
                <Card class="max-w-sm">
                  <CardHeader class="pb-2">
                    <CardTitle class="text-sm">卡片标题</CardTitle>
                    <CardDescription class="text-xs">这是shadcn-vue的Card组件示例</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p class="text-xs text-muted-foreground">卡片内容区域，展示组件自动应用ridge主题样式。</p>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              <!-- Avatar Group -->
              <div class="space-y-3">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">Avatar 组件</div>
                <div class="flex items-center gap-2 min-w-0">
                  <Avatar class="h-8 w-8 border-2 border-background shrink-0">
                    <AvatarFallback class="bg-primary text-primary-foreground text-xs">A</AvatarFallback>
                  </Avatar>
                  <Avatar class="h-8 w-8 border-2 border-background shrink-0">
                    <AvatarFallback class="bg-secondary text-secondary-foreground text-xs">B</AvatarFallback>
                  </Avatar>
                  <Avatar class="h-8 w-8 border-2 border-background shrink-0">
                    <AvatarFallback class="bg-accent text-accent-foreground text-xs">C</AvatarFallback>
                  </Avatar>
                  <span class="text-xs text-muted-foreground shrink-0">+3</span>
                </div>
              </div>

              <Separator />

              <!-- Input Example -->
              <div class="space-y-3">
                <div class="text-xs uppercase tracking-wide text-muted-foreground">Input 组件</div>
                <div class="flex gap-2 min-w-0">
                  <Input placeholder="输入文本..." class="max-w-xs min-w-0" />
                  <Button size="sm" class="shrink-0">提交</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Ridge Terrain Color Layers -->
          <Card>
            <CardHeader class="ridge-panel-header rounded-t-lg pb-6">
              <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                山脊色彩层次 - 从山脚到山顶
              </div>
            </CardHeader>
            <CardContent class="pt-6 space-y-4">
              <!-- 山脊色谱展示 -->
              <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-4 items-center">
                <!-- 山顶暖阳 -->
                <div class="text-xs text-muted-foreground whitespace-nowrap">山顶暖阳</div>
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex gap-2 shrink-0">
                    <div class="w-8 h-8 rounded bg-primary" title="珊瑚金 primary"></div>
                    <div class="w-8 h-8 rounded bg-accent" title="金黄 accent"></div>
                  </div>
                  <span class="text-xs text-muted-foreground truncate">山顶阳光照射的温暖色调</span>
                </div>

                <!-- 山腰云雾 -->
                <div class="text-xs text-muted-foreground whitespace-nowrap">山腰云雾</div>
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex gap-2 shrink-0">
                    <div class="w-8 h-8 rounded bg-card border" title="card 纯白"></div>
                    <div class="w-8 h-8 rounded bg-background border" title="background 米白"></div>
                  </div>
                  <span class="text-xs text-muted-foreground truncate">云雾缭绕的轻盈层次</span>
                </div>

                <!-- 山腰岩石 -->
                <div class="text-xs text-muted-foreground whitespace-nowrap">山腰岩石</div>
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex gap-2 shrink-0">
                    <div class="w-8 h-8 rounded bg-secondary border" title="secondary 沙色"></div>
                    <div class="w-8 h-8 rounded bg-muted border" title="muted 山岩灰"></div>
                  </div>
                  <span class="text-xs text-muted-foreground truncate">裸露的山岩层</span>
                </div>

                <!-- 山脚土壤 -->
                <div class="text-xs text-muted-foreground whitespace-nowrap">山脚土壤</div>
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex gap-2 shrink-0">
                    <div class="w-8 h-8 rounded" style="background: #8b7355" title="土壤棕"></div>
                    <div class="w-8 h-8 rounded" style="background: #6b5b4f" title="岩褐"></div>
                    <div class="w-8 h-8 rounded" style="background: #3d3229" title="深岩"></div>
                  </div>
                  <span class="text-xs text-muted-foreground truncate">深厚的土壤与岩石根基</span>
                </div>
              </div>

              <Separator />

              <!-- 设计理念说明 -->
              <p class="text-xs text-muted-foreground leading-relaxed">
                <span class="font-medium text-foreground">设计原理：</span>
                山脊色彩层次从深到浅呈现自然的过渡。深色的大地色系（山脚）提供稳固的视觉基础，
                中性的山岩灰色（山腰）营造层次感，温暖的米白色（云雾）带来开阔感，
                珊瑚金色（山顶暖阳）作为强调色点缀界面，象征视野的高度与温暖。
              </p>
            </CardContent>
          </Card>

          <!-- Ridge Design Philosophy -->
          <Card class="bg-muted/50 border-dashed">
            <CardContent class="pt-6">
              <p class="text-sm text-muted-foreground leading-relaxed">
                <span class="font-medium text-primary">山脊设计理念：</span>
                ridge的视觉设计灵感源自山脊意象。色彩从山脚的深沉土壤到山顶的温暖阳光，
                呈现层次分明的过渡。这种设计传达ridge作为AI工作平台的核心价值：
                <span class="text-foreground">稳固的基础</span>（大地色系）、
                <span class="text-foreground">清晰的层次</span>（山脊线条）、
                <span class="text-foreground">开阔的视野</span>（暖阳强调）。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
