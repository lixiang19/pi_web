import defaultTheme from './default.css?raw'
import amberTheme from './amber.css?raw'
import amethystTheme from './amethyst.css?raw'
import bubblegumTheme from './bubblegum.css?raw'
import caffeineTheme from './caffeine.css?raw'
import northernLightsTheme from './northernLights.css?raw'
import pastelDreamsTheme from './pastelDreams.css?raw'

const normalizeThemeCss = (themeCss: string) => {
  return themeCss.replace(
    /\n@theme\s+inline\s*\{[\s\S]*?\}\s*$/m,
    ''
  )
}

export const themes = {
  default: normalizeThemeCss(defaultTheme),
  amber: normalizeThemeCss(amberTheme),
  amethyst: normalizeThemeCss(amethystTheme),
  bubblegum: normalizeThemeCss(bubblegumTheme),
  caffeine: normalizeThemeCss(caffeineTheme),
  northernLights: normalizeThemeCss(northernLightsTheme),
  pastelDreams: normalizeThemeCss(pastelDreamsTheme)
}

export type ThemeName = keyof typeof themes

export const DEFAULT_THEME_NAME: ThemeName = 'default'
export const DEFAULT_THEME_MODE = 'dark'

export const themeOptions = [
  { label: '默认', value: 'default' },
  { label: '琥珀', value: 'amber' },
  { label: '紫水晶', value: 'amethyst' },
  { label: '泡泡糖', value: 'bubblegum' },
  { label: '咖啡因', value: 'caffeine' },
  { label: '北极光', value: 'northernLights' },
  { label: '粉彩梦境', value: 'pastelDreams' }
]
