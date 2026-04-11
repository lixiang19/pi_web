<script setup lang="ts">
import { RouterLink } from "vue-router";

import { Button } from "@/components/ui/button";
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 text-foreground">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_26%),radial-gradient(circle_at_right,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_30%)]"
    />
    <div class="ridge-panel-header relative w-full max-w-xl rounded-[32px] border border-border/40 p-10 text-center shadow-lg">
      <p class="text-[11px] font-black uppercase tracking-[0.3em] text-primary/70">
        Route Missing
      </p>
      <h1 class="mt-4 text-4xl font-black tracking-tight text-foreground">
        页面不存在
      </h1>
      <p class="mt-4 text-sm leading-7 text-muted-foreground">
        当前地址没有对应的工作台页面。返回主工作台继续操作。
      </p>
      <Button as-child class="mt-8 rounded-2xl px-6">
        <RouterLink to="/">
          返回工作台
        </RouterLink>
      </Button>
    </div>
  </div>
</template>