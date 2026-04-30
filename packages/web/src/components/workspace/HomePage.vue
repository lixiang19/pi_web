<script setup lang="ts">
import { Search } from "lucide-vue-next";

const query = defineModel<string>({ default: "" });

function handleSubmit() {
	// TODO: 主页搜索逻辑
}
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-8 px-8">
    <h1 class="text-2xl font-light tracking-wide text-foreground/80">
      Ridge
    </h1>

    <form
      class="w-full max-w-xl"
      @submit.prevent="handleSubmit"
    >
      <div class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 shadow-sm transition-colors focus-within:border-primary/50 focus-within:bg-background">
        <Search class="size-5 shrink-0 text-muted-foreground" />
        <input
          v-model="query"
          type="text"
          placeholder="搜索或输入命令..."
          class="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
          autofocus
        />
      </div>
    </form>

    <p class="text-xs text-muted-foreground/60">
      ⌘K 快速搜索
    </p>
  </div>
</template>
