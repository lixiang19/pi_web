<script setup lang="ts">
import WorkbenchFeatureShell from "@/components/workbench/WorkbenchFeatureShell.vue";
</script>

<template>
  <WorkbenchFeatureShell
    eyebrow="Datasets"
    title="数据集"
    description="数据集页作为一级路由固定下来，后续承接知识资源、结构化语料和导入后的数据资产。"
    :points="[
      '当前版本不伪造数据集列表，只把页面边界、标题和后续承载区域落稳。',
      '后续可以在这里接入上传、索引状态、来源和关联会话等能力。',
      '页面与会话主路由解耦，避免再把重资产功能塞回聊天工作台。'
    ]"
  />
</template>
