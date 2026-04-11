import { computed, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { themeOptions, type ThemeName } from "@/assets/registry";
import { useSettingsStore, type ThemeMode } from "@/stores/settings";
import { applyTheme } from "@/lib/theme";

export function useThemePreferences() {
  const settingsStore = useSettingsStore();
  const { resolvedThemeMode, isLoaded, themeName } = storeToRefs(settingsStore);

  const mode = computed<Exclude<ThemeMode, "system">>({
    get: () => resolvedThemeMode.value,
    set: (value) => settingsStore.setTheme(value),
  });

  const currentPreference = computed(() => ({
    themeName: themeName.value,
    mode: resolvedThemeMode.value,
  }));

  const setTheme = (nextThemeName: ThemeName) => {
    return settingsStore.setThemeName(nextThemeName);
  };

  const setMode = (nextMode: Exclude<ThemeMode, "system">) => {
    return settingsStore.setTheme(nextMode);
  };

  const currentThemeOption = computed(
    () =>
      themeOptions.find((option) => option.value === themeName.value) ||
      themeOptions[0],
  );

  watchEffect(() => {
    if (isLoaded.value) {
      applyTheme(themeName.value, resolvedThemeMode.value);
    }
  });

  return {
    currentPreference,
    currentThemeOption,
    mode,
    themeName,
    theme: themeName,
    setMode,
    setTheme,
    themeOptions,
    isLoaded,
  };
}
