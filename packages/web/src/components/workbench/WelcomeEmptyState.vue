<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const tips = [
  "选择一个项目，开启你的探索之旅",
  "在这里，每一次对话都是新的可能",
  "让想法自由流淌，我们帮你整理成章",
  "从代码到文档，从构思到实现",
  "你的智能工作伙伴，随时待命",
  "用自然语言描述需求，让 AI 为你实现",
  "思考、编码、调试 — 全方位协作",
  "每一次交互，都在拓展可能性的边界",
];

const currentIndex = ref(0);
const showText = ref(true);
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => {
    showText.value = false;
    // 等淡出动画完成后切换文字并淡入
    setTimeout(() => {
      currentIndex.value = (currentIndex.value + 1) % tips.length;
      showText.value = true;
    }, 500);
  }, 4000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center p-6 bg-background"
  >
    <!-- 背景微量装饰 -->
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.03]"
      style="background-image: radial-gradient(var(--primary) 0.5px, transparent 0.5px); background-size: 24px 24px"
    ></div>

    <!-- 循环文字 -->
    <div class="relative h-8 flex items-center justify-center overflow-hidden">
      <transition
        enter-active-class="transition-all duration-500 ease-out"
        enter-from-class="translate-y-3 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition-all duration-500 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-3 opacity-0"
      >
        <p
          v-if="showText"
          :key="currentIndex"
          class="whitespace-nowrap text-sm leading-relaxed text-muted-foreground/60"
        >
          {{ tips[currentIndex] }}
        </p>
      </transition>
    </div>

    <div class="mt-6 space-y-2 text-center">
      <p class="text-base font-semibold text-foreground">先选择项目</p>
      <p class="text-sm text-muted-foreground/70">
        从下方项目选择器里选已添加项目，再开始新会话。
      </p>
    </div>
  </div>
</template>
