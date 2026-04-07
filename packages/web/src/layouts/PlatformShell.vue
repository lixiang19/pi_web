<script setup lang="ts">
import { LayoutDashboard, Palette, Settings2 } from "lucide-vue-next";
import { computed } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const route = useRoute();

const navItems = [
  {
    name: "workbench",
    label: "工作台",
    to: "/",
    icon: LayoutDashboard,
  },
  {
    name: "settings",
    label: "系统设置",
    to: "/settings",
    icon: Settings2,
  },
  {
    name: "themes",
    label: "主题实验室",
    to: "/themes",
    icon: Palette,
  },
];

const pageTitle = computed(() => String(route.meta.title || "Pi 工作台"));
const pageDescription = computed(() =>
  String(route.meta.description || "Pi Web 平台工作区与导航入口。"),
);

const isNavItemActive = (name: string) => route.name === name;
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[#09090b] text-stone-50">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_26%),radial-gradient(circle_at_right,rgba(59,130,246,0.12),transparent_30%)]"
    />
    <div
      class="pointer-events-none absolute inset-0 bg-grid bg-[size:28px_28px] opacity-[0.04]"
    />

    <div class="relative mx-auto flex min-h-screen max-w-[1760px] flex-col px-3 py-3 sm:px-4 sm:py-4 xl:px-6 xl:py-5">
      <header class="mb-3 rounded-[28px] border border-white/10 bg-black/30 px-4 py-4 backdrop-blur sm:px-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <Badge class="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
                Pi Platform
              </Badge>
              <Badge variant="outline" class="border-white/10 bg-white/[0.03] text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
                Route Layer
              </Badge>
            </div>
            <div>
              <h1 class="text-2xl font-black tracking-tight text-stone-50 sm:text-3xl">
                {{ pageTitle }}
              </h1>
              <p class="mt-1 max-w-2xl text-sm leading-6 text-stone-400">
                {{ pageDescription }}
              </p>
            </div>
          </div>

          <nav class="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
            <RouterLink
              v-for="item in navItems"
              :key="item.name"
              :to="item.to"
              :class="cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all',
                isNavItemActive(item.name)
                  ? 'border-amber-400/30 bg-amber-500/10 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.1)]'
                  : 'border-white/10 bg-white/[0.03] text-stone-300 hover:bg-white/[0.06] hover:text-stone-50',
              )"
            >
              <component :is="item.icon" class="size-4" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </nav>
        </div>
      </header>

      <RouterView />
    </div>
  </div>
</template>