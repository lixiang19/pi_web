import {
  DEFAULT_THEME_MODE,
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

const isThemeName = (value: string): value is ThemeName => value in themes;

const isThemeMode = (value: string): value is Exclude<ThemeMode, "system"> =>
  value === "light" || value === "dark";

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

export const getResolvedThemePreference = (): ThemePreference => {
  const settingsStore = useSettingsStore();
  const mode = settingsStore.resolvedThemeMode;

  return {
    themeName: DEFAULT_THEME_NAME,
    mode,
  };
};

export const applyThemePreference = (preference: ThemePreference) => {
  applyTheme(preference.themeName, preference.mode);
};

export const initializeThemeSystem = () => {
  const settingsStore = useSettingsStore();
  const preference: ThemePreference = {
    themeName: DEFAULT_THEME_NAME,
    mode: settingsStore.resolvedThemeMode,
  };
  applyThemePreference(preference);
};

export const setThemeMode = async (mode: ThemeMode) => {
  const settingsStore = useSettingsStore();
  await settingsStore.setTheme(mode);

  const resolvedMode = settingsStore.resolvedThemeMode;
  const preference: ThemePreference = {
    themeName: DEFAULT_THEME_NAME,
    mode: resolvedMode,
  };
  applyThemePreference(preference);
};
