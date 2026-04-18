<script setup lang="ts">
import WorkbenchFeatureShell from "@/components/workbench/WorkbenchFeatureShell.vue";
</script>

<template>
  <WorkbenchFeatureShell
    eyebrow="Spaces"
    title="空间"
    description="空间路由用于沉淀更高层的工作区组织能力，包括资源编排、协作上下文与跨会话视图。"
    :points="[
      '首版只落下页面骨架和职责描述，不伪造空间成员、面板或示例数据。',
      '后续可在这里整合项目、会话、数据集和自动化形成更高层的空间视图。',
      '通过独立主路由，空间能力不会再和单个会话的上下文边界混淆。'
    ]"
  />
</template>
