import { computed, ref } from "vue";

import { themeOptions, type ThemeName } from "@/assets/registry";
import {
  applyThemePreference,
  getResolvedThemePreference,
  type ThemeMode,
} from "@/lib/theme";

export function useThemePreferences() {
  const initialPreference = getResolvedThemePreference();
  const themeName = ref<ThemeName>(initialPreference.themeName);
  const mode = ref<ThemeMode>(initialPreference.mode);

  const currentPreference = computed(() => ({
    themeName: themeName.value,
    mode: mode.value,
  }));

  const applyCurrentPreference = () => {
    applyThemePreference(currentPreference.value);
  };

  const setTheme = (nextThemeName: ThemeName) => {
    themeName.value = nextThemeName;
    applyCurrentPreference();
  };

  const setMode = (nextMode: ThemeMode) => {
    mode.value = nextMode;
    applyCurrentPreference();
  };

  const currentThemeOption = computed(
    () =>
      themeOptions.find((option) => option.value === themeName.value) ||
      themeOptions[0],
  );

  return {
    currentPreference,
    currentThemeOption,
    mode,
    setMode,
    setTheme,
    themeName,
    themeOptions,
  };
}