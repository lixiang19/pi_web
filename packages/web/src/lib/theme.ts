import {
  DEFAULT_THEME_NAME,
  themes,
  type ThemeName,
} from "@/assets/registry";
import { useSettingsStore, type ThemeMode } from "@/stores/settings";

export type ThemePreference = {
  themeName: ThemeName;
  mode: Exclude<ThemeMode, "system">;
};

const THEME_STYLE_ELEMENT_ID = "pi-web-theme-tokens";

const ensureThemeStyleElement = () => {
  const existingElement = document.getElementById(THEME_STYLE_ELEMENT_ID);
  if (existingElement instanceof HTMLStyleElement) {
    return existingElement;
  }

  const styleElement = document.createElement("style");
  styleElement.id = THEME_STYLE_ELEMENT_ID;
  document.head.append(styleElement);
  return styleElement;
};

export const applyTheme = (themeName: ThemeName, mode: Exclude<ThemeMode, "system"> = "dark") => {
  const styleElement = ensureThemeStyleElement();
  styleElement.textContent = themes[themeName];

  const root = document.documentElement;
  root.dataset["theme"] = themeName;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
};

const getThemePreferenceFromStore = (): ThemePreference => {
  const settingsStore = useSettingsStore();

  return {
    themeName: settingsStore.themeName ?? DEFAULT_THEME_NAME,
    mode: settingsStore.resolvedThemeMode,
  };
};

export const getResolvedThemePreference = (): ThemePreference => {
  return getThemePreferenceFromStore();
};

export const applyThemePreference = (preference: ThemePreference) => {
  applyTheme(preference.themeName, preference.mode);
};

export const initializeThemeSystem = () => {
  applyThemePreference(getThemePreferenceFromStore());
};

export const setThemeMode = async (mode: ThemeMode) => {
  const settingsStore = useSettingsStore();
  await settingsStore.setTheme(mode);
  applyThemePreference(getThemePreferenceFromStore());
};
