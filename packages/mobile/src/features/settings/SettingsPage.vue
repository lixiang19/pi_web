<script setup lang="ts">
import { ref } from "vue";
import { Database, Link, RefreshCcw, Smartphone } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { applyMobileTheme, loadMobileTheme } from "@/theme/mobile-theme";

const theme = ref(loadMobileTheme());

const toggleTheme = () => {
  theme.value = theme.value === "dark" ? "light" : "dark";
  applyMobileTheme(theme.value);
};
</script>

<template>
  <main class="mobile-screen" aria-labelledby="settings-title" data-testid="settings-screen">
    <p class="eyebrow">移动设置</p>
    <h1 id="settings-title">
      服务与设备
    </h1>
    <p class="screen-copy">
      设置页只放 ridge 服务地址、Android 设备注册状态和本地待发送队列状态。
    </p>
    <div class="settings-list" aria-label="移动端必要配置">
      <div class="settings-row">
        <Link class="size-4" aria-hidden="true" />
        <span>ridge 服务地址</span>
      </div>
      <div class="settings-row">
        <Smartphone class="size-4" aria-hidden="true" />
        <span>Android 设备注册状态</span>
      </div>
      <div class="settings-row">
        <RefreshCcw class="size-4" aria-hidden="true" />
        <span>重新注册设备</span>
      </div>
      <div class="settings-row">
        <Database class="size-4" aria-hidden="true" />
        <span>本地待发送草稿</span>
      </div>
      <div class="settings-row settings-row-action">
        <span>明暗模式</span>
        <Button type="button" variant="outline" size="sm" @click="toggleTheme">
          {{ theme === "dark" ? "深色" : "浅色" }}
        </Button>
      </div>
    </div>
  </main>
</template>
