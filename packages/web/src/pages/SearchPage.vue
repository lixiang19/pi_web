<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePiChatCore } from "@/composables/usePiChatCore";
import WorkbenchFeatureShell from "@/components/workbench/WorkbenchFeatureShell.vue";

const core = usePiChatCore();
const query = ref("");

const stats = computed(() => [
  `当前已加载 ${core.sessions.value.length} 个会话摘要，可作为后续统一搜索的首批索引来源。`,
  `工作区根目录：${core.info.value?.workspaceDir || "未就绪"}。`,
  query.value
    ? `搜索词“${query.value}”已记录到当前页面状态，后续可直接接入真实搜索接口。`
    : "首版先落下统一搜索入口与状态容器，不伪造结果列表。",
]);
</script>

<template>
  <WorkbenchFeatureShell
    eyebrow="Search"
    title="统一搜索"
    description="这里是全局搜索主路由。它不再和左侧会话过滤混在一起，后续会承接会话、文件、命令与资源的统一检索。"
    :points="stats"
  >
    <Card class="border-border/70 bg-card/60">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Search class="size-4 text-primary/70" />
          搜索输入
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          v-model="query"
          placeholder="搜索会话、文件、命令或资源..."
          class="h-11"
        />
      </CardContent>
    </Card>
  </WorkbenchFeatureShell>
</template>
