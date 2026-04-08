import { computed, ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { themeOptions, type ThemeName } from "@/assets/registry";
import { useSettingsStore, type ThemeMode } from "@/stores/settings";
import { applyTheme } from "@/lib/theme";

export function useThemePreferences() {
  const settingsStore = useSettingsStore();
  const { theme, resolvedThemeMode, isLoaded } = storeToRefs(settingsStore);

  const mode = computed<Exclude<ThemeMode, "system">>({
    get: () => resolvedThemeMode.value,
    set: (value) => settingsStore.setTheme(value),
  });

  const themeName = ref<ThemeName>("default");

  const currentPreference = computed(() => ({
    themeName: themeName.value,
    mode: mode.value,
  }));

  const applyCurrentPreference = () => {
    applyTheme(themeName.value, mode.value);
  };

  const setTheme = (nextThemeName: ThemeName) => {
    themeName.value = nextThemeName;
    applyCurrentPreference();
  };

  const setMode = (nextMode: Exclude<ThemeMode, "system">) => {
    settingsStore.setTheme(nextMode);
    applyCurrentPreference();
  };

  const currentThemeOption = computed(
    () =>
      themeOptions.find((option) => option.value === themeName.value) ||
      themeOptions[0],
  );

  watchEffect(() => {
    if (isLoaded.value) {
      applyCurrentPreference();
    }
  });

  return {
    currentPreference,
    currentThemeOption,
    mode,
    theme: themeName,
    setMode,
    setTheme,
    themeOptions,
    isLoaded,
  };
}
