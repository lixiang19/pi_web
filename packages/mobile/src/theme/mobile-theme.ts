export const MOBILE_THEME_STORAGE_KEY = "ridge.mobile.theme";

export type MobileTheme = "light" | "dark";

export function loadMobileTheme(storage: Storage = window.localStorage): MobileTheme {
  return storage.getItem(MOBILE_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function applyMobileTheme(
  theme: MobileTheme,
  root: HTMLElement = document.documentElement,
  storage: Storage = window.localStorage,
) {
  root.classList.toggle("dark", theme === "dark");
  storage.setItem(MOBILE_THEME_STORAGE_KEY, theme);
}

export function initializeMobileTheme() {
  applyMobileTheme(loadMobileTheme());
}
