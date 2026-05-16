<script setup lang="ts">
import { ref } from "vue";
import { Database, Link, RefreshCcw, Smartphone } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import { createAndroidDeviceClient } from "@/lib/device/android-device-client";
import { createDeviceStorage } from "@/lib/device/device-storage";
import { applyMobileTheme, loadMobileTheme } from "@/theme/mobile-theme";

const theme = ref(loadMobileTheme());
const api = createMobileApiClient();
const deviceStorage = createDeviceStorage();
const androidDevice = createAndroidDeviceClient({
  api,
  storage: deviceStorage,
});
const serviceUrl = ref(api.getServiceBaseUrl() ?? "");
const registration = ref(androidDevice.getRegistration());
const connectionStatus = ref(registration.value ? "已连接" : "未连接");
const errorMessage = ref("");
const registering = ref(false);

const toggleTheme = () => {
  theme.value = theme.value === "dark" ? "light" : "dark";
  applyMobileTheme(theme.value);
};

const registerDevice = async () => {
  errorMessage.value = "";
  registering.value = true;
  try {
    api.setServiceBaseUrl(serviceUrl.value);
    registration.value = await androidDevice.register();
    connectionStatus.value = "已连接";
  } catch (error) {
    connectionStatus.value = "连接失败";
    errorMessage.value = error instanceof Error ? error.message : "注册失败";
  } finally {
    registering.value = false;
  }
};

const reRegisterDevice = async () => {
  androidDevice.clearRegistration();
  registration.value = null;
  await registerDevice();
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
      <label class="settings-row settings-row-field">
        <Link class="size-4" aria-hidden="true" />
        <span>ridge 服务地址</span>
        <Input
          v-model="serviceUrl"
          type="url"
          inputmode="url"
          placeholder="https://ridge.example.com"
          data-testid="service-url-input"
        />
      </label>
      <div class="settings-row">
        <Smartphone class="size-4" aria-hidden="true" />
        <span>Android 设备注册状态</span>
        <strong data-testid="device-registration-status">{{ connectionStatus }}</strong>
      </div>
      <div v-if="registration" class="settings-row">
        <Smartphone class="size-4" aria-hidden="true" />
        <span>{{ registration.name }}</span>
        <code>{{ registration.deviceId }}</code>
      </div>
      <div class="settings-row settings-row-action">
        <RefreshCcw class="size-4" aria-hidden="true" />
        <span>{{ registration ? "重新注册设备" : "注册设备" }}</span>
        <Button
          type="button"
          size="sm"
          :disabled="registering"
          data-testid="register-device-button"
          @click="registration ? reRegisterDevice() : registerDevice()"
        >
          {{ registering ? "连接中" : "连接" }}
        </Button>
      </div>
      <div class="settings-row">
        <Database class="size-4" aria-hidden="true" />
        <span>本地待发送草稿</span>
      </div>
      <p v-if="errorMessage" class="settings-error" role="alert">
        {{ errorMessage }}
      </p>
      <div class="settings-row settings-row-action">
        <span>明暗模式</span>
        <Button type="button" variant="outline" size="sm" @click="toggleTheme">
          {{ theme === "dark" ? "深色" : "浅色" }}
        </Button>
      </div>
    </div>
  </main>
</template>
