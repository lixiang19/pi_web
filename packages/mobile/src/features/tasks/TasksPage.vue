<script setup lang="ts">
import { Circle, CircleDot, CircleCheck, SearchCheck } from "lucide-vue-next";

const taskGroups = [
  { label: "待办", icon: Circle },
  { label: "进行中", icon: CircleDot },
  { label: "审核中", icon: SearchCheck },
  { label: "已完成", icon: CircleCheck },
] as const;
</script>

<template>
  <main class="mobile-screen" aria-labelledby="tasks-title" data-testid="tasks-screen">
    <p class="eyebrow">任务轻操作</p>
    <h1 id="tasks-title">
      只看关键状态
    </h1>
    <p class="screen-copy">
      移动端任务页保留列表、详情和状态跟进的空间，不承接桌面看板拖拽与项目管理。
    </p>
    <div class="task-groups" aria-label="任务状态分组">
      <div v-for="group in taskGroups" :key="group.label" class="task-group">
        <component :is="group.icon" class="size-4" aria-hidden="true" />
        <span>{{ group.label }}</span>
      </div>
    </div>
  </main>
</template>
