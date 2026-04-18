<script setup lang="ts">
import WorkbenchFeatureShell from "@/components/workbench/WorkbenchFeatureShell.vue";
</script>

<template>
  <WorkbenchFeatureShell
    eyebrow="Terminal"
    title="终端"
    description="终端已经被提升为一级主路由。首版先确定页面骨架与职责边界，后续再接入真实终端运行时。"
    :points="[
      '终端不再被塞进会话页内部的补充面板，而是独立承担命令执行与输出浏览。',
      '当前版本明确不伪造 shell 输出，也不临时模拟 session 终端。',
      '页面已为后续接入真实终端容器预留独立内容区。'
    ]"
  />
</template>
