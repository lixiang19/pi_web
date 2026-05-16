<script setup lang="ts">
import {
  Bell,
  Database,
  Download,
  HardDrive,
  Languages,
  LogOut,
  Monitor,
  MoonStar,
  Palette,
  PanelLeftClose,
  Server,
  Sparkles,
  SunMedium,
  Upload,
} from "lucide-vue-next";
import type { AcceptableValue } from "reka-ui";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { themeOptions, type ThemeName } from "@/assets/registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useThemePreferences } from "@/composables/useThemePreferences";
import {
  downloadWorkspaceBackup,
  getDevices,
  getProviders,
  getSystemInfo,
  restoreWorkspaceBackup,
  type WorkspaceRestoreResponse,
} from "@/lib/api";
import { logoutAuth } from "@/lib/auth";
import type { ThemeMode } from "@/stores/settings";
import { useSettingsStore } from "@/stores/settings";
import type { DeviceItem, ProviderGroup, SystemInfo, ThinkingLevel } from "@/lib/types";

const router = useRouter();
const { mode, setMode, setTheme, themeName } = useThemePreferences();
const settingsStore = useSettingsStore();
const providerGroups = ref<ProviderGroup[]>([]);
const systemInfo = ref<SystemInfo | null>(null);
const devices = ref<DeviceItem[]>([]);
const backupStatus = ref<string>("");
const restoreStatus = ref<WorkspaceRestoreResponse | null>(null);
const backupError = ref<string>("");
const DEFAULT_BACKGROUND_MODEL_VALUE = "__ridge-default-background-model__";

const modeOptions: Array<{
  label: string;
  value: Exclude<ThemeMode, "system">;
  icon: typeof SunMedium;
  desc: string;
}> = [
  { label: "浅色", value: "light", icon: SunMedium, desc: "明亮的日间模式" },
  { label: "深色", value: "dark", icon: MoonStar, desc: "护眼的夜间模式" },
];

const handleThemeChange = (value: AcceptableValue) => {
  if (typeof value === "string") {
    setTheme(value as ThemeName);
  }
};

const handleNotificationsChange = async (checked: boolean) => {
  await settingsStore.setNotifications(checked);
};

const handleLanguageChange = async (value: AcceptableValue) => {
  if (typeof value === "string") {
    await settingsStore.setLanguage(value);
  }
};

const modelOptions = computed(() =>
  providerGroups.value.flatMap((provider) =>
    Object.values(provider.models).map((model) => ({
      value: `${provider.id}/${model.id}`,
      label: `${provider.name} / ${model.name || model.id}`,
    })),
  ),
);

const deviceStatusLabel = computed(() => {
  const total = systemInfo.value?.deviceStatus.total ?? devices.value.length;
  const online =
    systemInfo.value?.deviceStatus.online ??
    devices.value.filter((device) => device.status === "online").length;
  return `${online} / ${total} 在线`;
});

const backgroundModelValue = computed(
  () => settingsStore.backgroundAgentModel || DEFAULT_BACKGROUND_MODEL_VALUE,
);

const thinkingOptions: Array<{ label: string; value: ThinkingLevel }> = [
  { label: "关闭", value: "off" },
  { label: "最小", value: "minimal" },
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
  { label: "极高", value: "xhigh" },
];

const handleBackgroundModelChange = async (value: AcceptableValue) => {
  if (typeof value !== "string") return;
  await settingsStore.setBackgroundAgentModel(
    value === DEFAULT_BACKGROUND_MODEL_VALUE ? "" : value,
  );
};

const handleBackgroundThinkingChange = async (value: AcceptableValue) => {
  if (typeof value === "string") {
    await settingsStore.setBackgroundAgentThinkingLevel(value as ThinkingLevel);
  }
};

const loadSystemSnapshot = async () => {
  const [info, deviceResponse] = await Promise.all([
    getSystemInfo(),
    getDevices(),
  ]);
  systemInfo.value = info;
  devices.value = deviceResponse.devices;
};

onMounted(async () => {
  try {
    const [response] = await Promise.all([
      getProviders(),
      loadSystemSnapshot(),
    ]);
    providerGroups.value = response.providers;
  } catch {
    providerGroups.value = [];
  }
});

const handleBackupDownload = async () => {
  backupError.value = "";
  backupStatus.value = "正在生成备份";
  try {
    const backup = await downloadWorkspaceBackup();
    const link = document.createElement("a");
    const objectUrl =
      typeof URL.createObjectURL === "function" ? URL.createObjectURL(backup.blob) : "";
    link.href = objectUrl;
    link.download = backup.fileName;
    if (objectUrl) {
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    }
    backupStatus.value = `备份已生成：${backup.fileName}`;
  } catch (error) {
    backupError.value = error instanceof Error ? error.message : "备份失败";
    backupStatus.value = "";
  }
};

const handleRestoreFileChange = async (event: Event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  backupError.value = "";
  restoreStatus.value = null;
  try {
    restoreStatus.value = await restoreWorkspaceBackup(file);
    await loadSystemSnapshot();
  } catch (error) {
    backupError.value = error instanceof Error ? error.message : "恢复失败";
  }
};

const handleLogout = async () => {
  await logoutAuth();
  await router.replace({ name: "login" });
};

const themePreviewColors: Record<string, string> = {
  ridge: "#e07a5f",
  default: "#6366f1",
  amber: "#d97706",
  amethyst: "#7c3aed",
  bubblegum: "#ec4899",
  caffeine: "#78350f",
  northernLights: "#059669",
  pastelDreams: "#a78bfa",
};
</script>

<template>
  <div class="h-full overflow-auto bg-background">
    <div class="mx-auto max-w-2xl px-6 py-10">
      <div class="mb-10">
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">设置</h1>
        <p class="mt-2 text-sm text-muted-foreground">管理你的 ridge 工作台偏好。</p>
      </div>

      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Palette class="size-3.5" />
          外观
        </div>

        <Card class="mb-3">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-medium">颜色主题</CardTitle>
          </CardHeader>
          <CardContent>
            <Select :model-value="themeName" @update:model-value="handleThemeChange">
              <SelectTrigger class="w-full">
                <div class="flex items-center gap-2.5">
                  <span
                    class="inline-block size-3 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                    :style="{ backgroundColor: themePreviewColors[themeName] ?? '#888' }"
                  />
                  <SelectValue placeholder="选择主题" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="theme in themeOptions"
                  :key="theme.value"
                  :value="theme.value"
                >
                  <div class="flex items-center gap-2.5">
                    <span
                      class="inline-block size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                      :style="{ backgroundColor: themePreviewColors[theme.value] ?? '#888' }"
                    />
                    {{ theme.label }}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-medium">显示模式</CardTitle>
          </CardHeader>
          <CardContent class="grid grid-cols-2 gap-3">
            <button
              v-for="option in modeOptions"
              :key="option.value"
              class="group flex items-center gap-3 rounded-lg border p-3.5 text-left transition-all duration-150"
              :class="
                mode === option.value
                  ? 'border-primary/50 bg-primary/8 text-foreground shadow-sm'
                  : 'border-border/60 bg-card text-foreground/80 hover:border-border hover:bg-muted/50'
              "
              @click="setMode(option.value)"
            >
              <div
                class="flex size-8 items-center justify-center rounded-md transition-colors"
                :class="mode === option.value ? 'bg-primary/15' : 'bg-muted'"
              >
                <component
                  :is="option.icon"
                  class="size-4 transition-colors"
                  :class="mode === option.value ? 'text-primary' : 'text-muted-foreground'"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium leading-tight">{{ option.label }}</div>
                <div class="mt-0.5 text-[11px] text-muted-foreground">{{ option.desc }}</div>
              </div>
            </button>
          </CardContent>
        </Card>
      </section>

      <Separator class="my-8" />

      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Server class="size-3.5" />
          系统
        </div>

        <Card>
          <CardContent class="divide-y divide-border/60 p-0">
            <div class="grid gap-1 px-5 py-4">
              <div class="flex items-center gap-2 text-sm font-medium">
                <HardDrive class="size-4 text-muted-foreground" />
                数据目录
              </div>
              <div class="break-all text-xs text-muted-foreground">{{ systemInfo?.dataDir || "加载中" }}</div>
            </div>
            <div class="grid gap-1 px-5 py-4">
              <div class="flex items-center gap-2 text-sm font-medium">
                <Database class="size-4 text-muted-foreground" />
                数据库
              </div>
              <div class="break-all text-xs text-muted-foreground">{{ systemInfo?.ridgeDbPath || "加载中" }}</div>
            </div>
            <div class="grid gap-1 px-5 py-4">
              <div class="text-sm font-medium">默认工作空间</div>
              <div class="break-all text-xs text-muted-foreground">{{ systemInfo?.defaultWorkspaceDir || systemInfo?.workspaceDir || "加载中" }}</div>
            </div>
            <div class="flex items-center justify-between px-5 py-4">
              <div>
                <div class="text-sm font-medium">服务状态</div>
                <div class="mt-1 text-[11px] text-muted-foreground">API 在线，备份服务 {{ systemInfo?.serviceStatus.backup || "加载中" }}</div>
              </div>
              <div class="text-xs text-muted-foreground">{{ deviceStatusLabel }}</div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator class="my-8" />

      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Database class="size-3.5" />
          备份恢复
        </div>

        <Card>
          <CardContent class="space-y-4 px-5 py-4">
            <div class="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                data-test="settings-backup-download"
                @click="handleBackupDownload"
              >
                <Download class="mr-2 size-4" />
                立即备份
              </Button>
              <label>
                <input
                  data-test="settings-restore-file"
                  class="sr-only"
                  type="file"
                  accept=".zip,application/zip"
                  @change="handleRestoreFileChange"
                >
                <span class="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
                  <Upload class="size-4" />
                  选择恢复包
                </span>
              </label>
            </div>
            <div v-if="backupStatus" class="text-xs text-muted-foreground">{{ backupStatus }}</div>
            <div v-if="backupError" class="text-xs text-destructive">{{ backupError }}</div>
            <div v-if="restoreStatus" class="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <div class="font-medium text-foreground">恢复完成</div>
              <div class="mt-1 break-all">恢复前快照：{{ restoreStatus.preRestoreSnapshotPath }}</div>
              <div class="mt-1">RAG 与 search_chunks 已标记为待重建。</div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator class="my-8" />

      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <LogOut class="size-3.5" />
          安全
        </div>

        <Card>
          <CardContent class="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <div class="text-sm font-medium">退出登录</div>
              <div class="mt-1 text-[11px] text-muted-foreground">清除当前浏览器的登录会话。</div>
            </div>
            <Button variant="outline" @click="handleLogout">退出</Button>
          </CardContent>
        </Card>
      </section>

      <Separator class="my-8" />

      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Sparkles class="size-3.5" />
          偏好
        </div>

        <Card>
          <CardContent class="divide-y divide-border/60 p-0">
            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Bell class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">通知</div>
                  <div class="text-[11px] text-muted-foreground">接收工作台消息提醒</div>
                </div>
              </div>
              <Switch
                :checked="settingsStore.notifications"
                @update:checked="handleNotificationsChange"
              />
            </div>

            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <PanelLeftClose class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">折叠侧边栏</div>
                  <div class="text-[11px] text-muted-foreground">默认收起左侧导航</div>
                </div>
              </div>
              <Switch
                :checked="settingsStore.sidebarCollapsed"
                @update:checked="(v: boolean) => settingsStore.setSidebarCollapsed(v)"
              />
            </div>

            <div class="flex items-center justify-between px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Languages class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">语言</div>
                  <div class="text-[11px] text-muted-foreground">界面显示语言</div>
                </div>
              </div>
              <Select
                :model-value="settingsStore.language"
                @update:model-value="handleLanguageChange"
              >
                <SelectTrigger class="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="flex items-center justify-between gap-4 px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Sparkles class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">后台整理模型</div>
                  <div class="text-[11px] text-muted-foreground">summary / memory agent 使用</div>
                </div>
              </div>
              <Select
                :model-value="backgroundModelValue"
                @update:model-value="handleBackgroundModelChange"
              >
                <SelectTrigger class="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="DEFAULT_BACKGROUND_MODEL_VALUE">Pi 默认模型</SelectItem>
                  <SelectItem
                    v-for="model in modelOptions"
                    :key="model.value"
                    :value="model.value"
                  >
                    {{ model.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="flex items-center justify-between gap-4 px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Sparkles class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">后台思考强度</div>
                  <div class="text-[11px] text-muted-foreground">后台整理任务默认使用低强度</div>
                </div>
              </div>
              <Select
                :model-value="settingsStore.backgroundAgentThinkingLevel"
                @update:model-value="handleBackgroundThinkingChange"
              >
                <SelectTrigger class="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="thinking in thinkingOptions"
                    :key="thinking.value"
                    :value="thinking.value"
                  >
                    {{ thinking.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator class="my-8" />

      <section>
        <div class="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Monitor class="size-3.5" />
          关于
        </div>

        <Card>
          <CardContent class="px-5 py-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">ridge</div>
              <div class="text-xs text-muted-foreground">v0.1.0</div>
            </div>
            <p class="mt-1.5 text-[11px] text-muted-foreground">你的 AI 工作平台</p>
          </CardContent>
        </Card>
      </section>
    </div>
  </div>
</template>
