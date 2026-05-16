<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import { createAndroidDeviceClient } from "@/lib/device/android-device-client";
import { createDeviceStorage } from "@/lib/device/device-storage";
import { mainNavItems, settingsNavItem } from "@/router/routes";

const route = useRoute();
const router = useRouter();

const openRoute = async (routeName: string) => {
  if (route.name !== routeName) {
    await router.push({ name: routeName });
  }
};

onMounted(() => {
  const api = createMobileApiClient();
  const device = createAndroidDeviceClient({
    api,
    storage: createDeviceStorage(),
  });
  if (!api.getServiceBaseUrl() || !device.getRegistration()) {
    return;
  }
  void device.heartbeat().catch((error: unknown) => {
    console.warn("[mobile] Android heartbeat failed", error);
  });
});
</script>

<template>
  <div class="mobile-shell">
    <header class="mobile-header">
      <div>
        <p class="brand-kicker">
          ridge mobile
        </p>
        <strong>ridge</strong>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="打开移动设置"
        data-testid="settings-entry"
        @click="openRoute(settingsNavItem.routeName)"
      >
        <component :is="settingsNavItem.icon" class="size-5" aria-hidden="true" />
      </Button>
    </header>

    <RouterView />

    <nav class="bottom-nav" aria-label="移动端主导航">
      <button
        v-for="item in mainNavItems"
        :key="item.routeName"
        type="button"
        class="bottom-nav-item"
        :class="{ active: route.name === item.routeName }"
        :aria-current="route.name === item.routeName ? 'page' : undefined"
        data-testid="bottom-nav-item"
        :data-route="item.routeName"
        @click="openRoute(item.routeName)"
      >
        <component :is="item.icon" class="size-5" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>
