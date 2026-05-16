<script setup lang="ts">
import { MessageCircle, Paperclip, Send } from "lucide-vue-next";
</script>

<template>
  <main class="mobile-screen" aria-labelledby="chat-title" data-testid="chat-screen">
    <p class="eyebrow">轻对话</p>
    <h1 id="chat-title">
      普通会话入口
    </h1>
    <p class="screen-copy">
      保留移动端消息输入、附件和流式回复区域，不引入桌面工作台、多标签或终端。
    </p>
    <div class="message-draft" aria-label="移动端消息草稿">
      <MessageCircle class="size-5" aria-hidden="true" />
      <span>等待接入服务连接</span>
      <div class="message-actions">
        <Paperclip class="size-4" aria-hidden="true" />
        <Send class="size-4" aria-hidden="true" />
      </div>
    </div>
  </main>
</template>
