import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_NAME,
  themes,
  type ThemeName,
} from '@/assets/registry'

export type ThemeMode = 'light' | 'dark'

const THEME_STYLE_ELEMENT_ID = 'pi-web-theme-tokens'

const ensureThemeStyleElement = () => {
  const existingElement = document.getElementById(THEME_STYLE_ELEMENT_ID)
  if (existingElement instanceof HTMLStyleElement) {
    return existingElement
  }

  const styleElement = document.createElement('style')
  styleElement.id = THEME_STYLE_ELEMENT_ID
  document.head.append(styleElement)
  return styleElement
}

export const applyTheme = (themeName: ThemeName, mode: ThemeMode = 'dark') => {
  const styleElement = ensureThemeStyleElement()
  styleElement.textContent = themes[themeName]

  const root = document.documentElement
  root.dataset["theme"] = themeName
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
}

export const initializeThemeSystem = () => {
  applyTheme(DEFAULT_THEME_NAME, DEFAULT_THEME_MODE)
}