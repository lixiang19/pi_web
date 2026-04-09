<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { CheckIcon, CopyIcon } from 'lucide-vue-next'
import { ref, computed } from 'vue'

interface Props {
  code: string
  language?: string
  class?: HTMLAttributes['class']
  showCopy?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  language: 'text',
  showCopy: true,
})

const copied = ref(false)

const displayCode = computed(() => props.code.trim())

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<template>
  <div :class="cn('relative group rounded-lg bg-muted/80 overflow-hidden', props.class)">
    <!-- Copy button -->
    <button
      v-if="showCopy"
      type="button"
      :class="cn(
        'absolute right-2 top-2 z-10',
        'flex h-7 w-7 items-center justify-center rounded-md',
        'bg-background/80 text-muted-foreground opacity-0 transition-all duration-200',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'group-hover:opacity-100',
        copied && 'bg-green-500/10 text-green-500 opacity-100',
      )"
      :aria-label="copied ? '已复制' : '复制代码'"
      @click="handleCopy"
    >
      <CheckIcon v-if="copied" class="h-3.5 w-3.5" aria-hidden="true" />
      <CopyIcon v-else class="h-3.5 w-3.5" aria-hidden="true" />
    </button>

    <!-- Code content -->
    <pre
      :class="cn(
        'overflow-x-auto p-3 text-xs font-mono leading-relaxed',
        'text-foreground',
      )"
    ><code>{{ displayCode }}</code></pre>
  </div>
</template>
