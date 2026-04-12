import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { DEFAULT_THEME_NAME, type ThemeName } from "@/assets/registry";
import {
  getSettings,
  setSettings,
  type Settings,
} from "@/lib/api/storage";
import type { ThinkingLevel } from "@/lib/types";

export type ThemeMode = "light" | "dark" | "system";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  const isLoaded = computed(() => settings.value !== null);

  const theme = computed<ThemeMode>(() => settings.value?.theme ?? "system");
  const themeName = computed<ThemeName>(
    () => settings.value?.themeName ?? DEFAULT_THEME_NAME,
  );
  const language = computed(() => settings.value?.language ?? "zh-CN");
  const sidebarCollapsed = computed(() => settings.value?.sidebarCollapsed ?? false);
  const notifications = computed(() => settings.value?.notifications ?? true);

  // Default composer selections
  const defaultModel = computed(() => settings.value?.defaultModel ?? "");
  const defaultAgent = computed(() => settings.value?.defaultAgent ?? "");
  const defaultThinkingLevel = computed<ThinkingLevel>(
    () => settings.value?.defaultThinkingLevel ?? "medium",
  );

  const resolvedThemeMode = computed<"light" | "dark">(() => {
    const mode = theme.value;
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return mode;
  });

  async function load(): Promise<void> {
    if (isLoading.value) return;

    isLoading.value = true;
    error.value = null;

    try {
      settings.value = await getSettings();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "加载设置失败";
      console.error("Failed to load settings:", err);
    } finally {
      isLoading.value = false;
    }
  }

  async function save(partial: Partial<Settings>): Promise<void> {
    if (isSaving.value) return;

    isSaving.value = true;
    error.value = null;

    try {
      const updated = await setSettings(partial);
      settings.value = updated;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "保存设置失败";
      console.error("Failed to save settings:", err);
      throw err;
    } finally {
      isSaving.value = false;
    }
  }

  async function setTheme(theme: ThemeMode): Promise<void> {
    await save({ theme });
  }

  async function setThemeName(themeName: ThemeName): Promise<void> {
    await save({ themeName });
  }

  async function setLanguage(language: string): Promise<void> {
    await save({ language });
  }

  async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
    await save({ sidebarCollapsed: collapsed });
  }

  async function setNotifications(enabled: boolean): Promise<void> {
    await save({ notifications: enabled });
  }

  async function setDefaultModel(model: string): Promise<void> {
    await save({ defaultModel: model });
  }

  async function setDefaultAgent(agent: string): Promise<void> {
    await save({ defaultAgent: agent });
  }

  async function setDefaultThinkingLevel(level: ThinkingLevel): Promise<void> {
    await save({ defaultThinkingLevel: level });
  }

  function toggleSidebar(): void {
    setSidebarCollapsed(!sidebarCollapsed.value);
  }

  return {
    settings,
    isLoading,
    isSaving,
    isLoaded,
    error,
    theme,
    themeName,
    language,
    sidebarCollapsed,
    notifications,
    defaultModel,
    defaultAgent,
    defaultThinkingLevel,
    resolvedThemeMode,
    load,
    save,
    setTheme,
    setThemeName,
    setLanguage,
    setSidebarCollapsed,
    setNotifications,
    setDefaultModel,
    setDefaultAgent,
    setDefaultThinkingLevel,
    toggleSidebar,
  };
});
