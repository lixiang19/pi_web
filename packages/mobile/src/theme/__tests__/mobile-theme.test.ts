import { describe, expect, it } from "vitest";
import {
  MOBILE_THEME_STORAGE_KEY,
  applyMobileTheme,
  loadMobileTheme,
} from "@/theme/mobile-theme";

describe("mobile theme contract", () => {
  it("applies light and dark themes through the root class and local storage", () => {
    applyMobileTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(MOBILE_THEME_STORAGE_KEY)).toBe("dark");
    expect(loadMobileTheme()).toBe("dark");

    applyMobileTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(MOBILE_THEME_STORAGE_KEY)).toBe("light");
    expect(loadMobileTheme()).toBe("light");
  });
});
