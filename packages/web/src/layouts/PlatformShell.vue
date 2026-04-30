<script setup lang="ts">
import { RouterView } from "vue-router";
import WorkbenchSidebar from "@/components/workbench/WorkbenchSidebar.vue";
import { TooltipProvider } from "@/components/ui/tooltip";
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside class="w-52 shrink-0 overflow-hidden border-r border-sidebar-border/70 bg-sidebar">
        <WorkbenchSidebar />
      </aside>

      <main class="min-w-0 flex-1 overflow-hidden">
        <RouterView v-slot="{ Component, route }">
          <KeepAlive>
            <component :is="Component" v-if="route.name === 'chat'" />
          </KeepAlive>
          <component :is="Component" v-if="route.name !== 'chat'" />
        </RouterView>
      </main>
    </div>
  </TooltipProvider>
</template>
