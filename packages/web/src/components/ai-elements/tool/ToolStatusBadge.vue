<!-- StatusBadge.vue -->
<script setup lang="ts">
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import type { Component } from 'vue'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from 'lucide-vue-next'
import { computed } from 'vue'

export type ToolPart = ToolUIPart | DynamicToolUIPart

const props = defineProps<{
  state: ToolPart['state']
}>()

const label = computed(() => {
  const labels: Record<ToolPart['state'], string> = {
    'input-streaming': '等待中',
    'input-available': '运行中',
    'approval-requested': '等待确认',
    'approval-responded': '已响应',
    'output-available': '已完成',
    'output-error': '错误',
    'output-denied': '已拒绝',
  }
  return labels[props.state]
})

const icon = computed<Component>(() => {
  const icons: Record<ToolPart['state'], Component> = {
    'input-streaming': CircleIcon,
    'input-available': ClockIcon,
    'approval-requested': ClockIcon,
    'approval-responded': CheckCircleIcon,
    'output-available': CheckCircleIcon,
    'output-error': XCircleIcon,
    'output-denied': XCircleIcon,
  }
  return icons[props.state]
})

// 使用主题变量代替硬编码颜色，确保明暗主题兼容性
const iconClass = computed(() => {
  const baseClasses = 'size-3.5 flex-shrink-0'
  const stateClasses: Record<ToolPart['state'], string> = {
    'input-streaming': `${baseClasses} text-muted-foreground`,
    'input-available': `${baseClasses} animate-pulse text-primary`,
    'approval-requested': `${baseClasses} text-yellow-500`,
    'approval-responded': `${baseClasses} text-blue-500`,
    'output-available': `${baseClasses} text-green-500`,
    'output-error': `${baseClasses} text-destructive`,
    'output-denied': `${baseClasses} text-orange-500`,
  }
  return stateClasses[props.state]
})

// 状态对应的徽章变体
const badgeVariant = computed(() => {
  const variants: Record<ToolPart['state'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    'input-streaming': 'secondary',
    'input-available': 'default',
    'approval-requested': 'default',
    'approval-responded': 'secondary',
    'output-available': 'secondary',
    'output-error': 'destructive',
    'output-denied': 'destructive',
  }
  return variants[props.state]
})
</script>

<template>
  <Badge
    class="gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
    :variant="badgeVariant"
  >
    <component :is="icon" :class="iconClass" aria-hidden="true" />
    <span>{{ label }}</span>
  </Badge>
</template>
