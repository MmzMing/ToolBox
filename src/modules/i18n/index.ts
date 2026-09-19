import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import { usePreferencesStore, type Locale } from '@/stores/preferences.store'

export const i18n = i18next

/**
 * 语言包按命名空间拆分为 locales/<lang>/*.json（文件名即命名空间），
 * 每个分类一个 tools-*.json，多分类并行开发互不冲突（agent.md §9）。
 */
const localeLoaders = {
  zh: import.meta.glob('./locales/zh/*.json'),
  en: import.meta.glob('./locales/en/*.json'),
} satisfies Record<Locale, Record<string, () => Promise<unknown>>>

async function loadLocale(locale: Locale): Promise<void> {
  const loaders = localeLoaders[locale] ?? {}
  await Promise.all(
    Object.entries(loaders).map(async ([file, load]) => {
      const namespace = file
        .split('/')
        .pop()
        ?.replace(/\.json$/, '')
      if (!namespace || i18next.hasResourceBundle(locale, namespace)) {
        return
      }
      const mod = (await load()) as { default: Record<string, unknown> }
      i18next.addResourceBundle(locale, namespace, mod.default, true, true)
    }),
  )
}

export async function initI18n(locale: Locale): Promise<void> {
  await i18next.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    returnObjects: true,
    partialBundledLanguages: true,
    // 开发期暴露缺失键（命名空间=文件名约定：如 'not-found'，不是 'notFound'）
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (lngs, ns, key) => {
      console.warn(`[i18n] missing key: ${ns}:${key} (${lngs.join(',')})`)
    },
  })
  await loadLocale(locale)
  // 后台预载另一语言：跨语言搜索与切换零等待
  const other: Locale = locale === 'zh' ? 'en' : 'zh'
  void loadLocale(other).catch(() => {})
}

/** 切换语言：按需加载语言包后再生效（store 与 i18next 同步更新） */
export async function changeLocale(locale: Locale): Promise<void> {
  await loadLocale(locale)
  usePreferencesStore.getState().setLocale(locale)
  await i18next.changeLanguage(locale)
}

/** 首访语言协商：持久化偏好 → 浏览器语言 → 默认中文 */
export function resolveInitialLocale(): Locale {
  const stored = usePreferencesStore.getState().locale
  if (stored === 'zh' || stored === 'en') {
    return stored
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : ''
  return nav.startsWith('zh') ? 'zh' : 'en'
}
