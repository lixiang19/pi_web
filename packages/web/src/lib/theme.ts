import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_NAME,
  themes,
  type ThemeName,
} from '@/assets/registry'

export type ThemeMode = 'light' | 'dark'
export type ThemePreference = {
  themeName: ThemeName
  mode: ThemeMode
}

const THEME_STYLE_ELEMENT_ID = 'pi-web-theme-tokens'
const THEME_STORAGE_KEY = 'pi-web.theme.preference.v1'

const isThemeName = (value: string): value is ThemeName => value in themes

const isThemeMode = (value: string): value is ThemeMode =>
  value === 'light' || value === 'dark'

const getDefaultThemePreference = (): ThemePreference => ({
  themeName: DEFAULT_THEME_NAME,
  mode: DEFAULT_THEME_MODE,
})

const readStoredThemePreference = (): ThemePreference | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as {
      themeName?: string
      mode?: string
    }
    const themeName = parsed.themeName
    const mode = parsed.mode

    if (
      typeof themeName !== 'string' ||
      typeof mode !== 'string' ||
      !isThemeName(themeName) ||
      !isThemeMode(mode)
    ) {
      return null
    }

    return {
      themeName,
      mode,
    }
  } catch {
    return null
  }
}

const writeStoredThemePreference = (preference: ThemePreference) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference))
}

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

export const getResolvedThemePreference = (): ThemePreference =>
  readStoredThemePreference() || getDefaultThemePreference()

export const applyThemePreference = (
  preference: ThemePreference,
  options?: { persist?: boolean },
) => {
  applyTheme(preference.themeName, preference.mode)

  if (options?.persist === false) {
    return
  }

  writeStoredThemePreference(preference)
}

export const initializeThemeSystem = () => {
  applyThemePreference(getResolvedThemePreference(), { persist: false })
}