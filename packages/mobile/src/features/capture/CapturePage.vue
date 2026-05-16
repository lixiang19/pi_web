<script setup lang="ts">
import { Camera, Mic, Type } from "lucide-vue-next";
</script>

<template>
  <main class="mobile-screen" aria-labelledby="capture-title" data-testid="capture-screen">
    <p class="eyebrow">移动捕捉</p>
    <h1 id="capture-title">
      先把闪念留下
    </h1>
    <p class="screen-copy">
      第一版入口保留文字、录音、拍照和相册草稿位置；具体提交链路由后续捕捉任务接入。
    </p>
    <div class="quick-grid" aria-label="捕捉方式">
      <button type="button" class="quick-action">
        <Type class="size-5" aria-hidden="true" />
        <span>文字</span>
      </button>
      <button type="button" class="quick-action">
        <Mic class="size-5" aria-hidden="true" />
        <span>录音</span>
      </button>
      <button type="button" class="quick-action">
        <Camera class="size-5" aria-hidden="true" />
        <span>照片</span>
      </button>
    </div>
  </main>
</template>
