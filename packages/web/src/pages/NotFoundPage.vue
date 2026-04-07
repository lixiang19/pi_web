<script setup lang="ts">
import { RouterLink } from "vue-router";

import { Button } from "@/components/ui/button";
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090b] px-6 text-stone-50">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_26%),radial-gradient(circle_at_right,rgba(59,130,246,0.12),transparent_30%)]"
    />
    <div class="relative w-full max-w-xl rounded-[32px] border border-white/10 bg-black/35 p-10 text-center backdrop-blur">
      <p class="text-[11px] font-black uppercase tracking-[0.3em] text-amber-300/80">
        Route Missing
      </p>
      <h1 class="mt-4 text-4xl font-black tracking-tight text-stone-50">
        页面不存在
      </h1>
      <p class="mt-4 text-sm leading-7 text-stone-400">
        当前地址没有对应的工作台页面。返回主工作台继续操作。
      </p>
      <Button as-child class="mt-8 rounded-2xl bg-amber-500 px-6 text-black hover:bg-amber-400">
        <RouterLink to="/">
          返回工作台
        </RouterLink>
      </Button>
    </div>
  </div>
</template>