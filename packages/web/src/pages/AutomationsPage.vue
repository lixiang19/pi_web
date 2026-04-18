<script setup lang="ts">
import WorkbenchFeatureShell from "@/components/workbench/WorkbenchFeatureShell.vue";
</script>

<template>
  <WorkbenchFeatureShell
    eyebrow="Automations"
    title="自动化"
    description="自动化是独立主路由，用来承接未来的定时任务、线程唤醒和工作流配置。"
    :points="[
      '首版先落下稳定入口和真实页面，不把自动化能力继续藏在会话细节里。',
      '当前页面只展示产品边界与后续接入方向，不提供伪造任务数据。',
      '后续接入时可以直接承接 thread heartbeat 与 cron 两类自动化。'
    ]"
  />
</template>
