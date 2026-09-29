import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import { usePreferencesStore, type Locale } from '@/stores/preferences.store'

export const i18n = i18next

/**
 * 同步 <html lang>：不同步就是错误信号（英文界面下文档仍声明 zh-CN），
 * 搜索引擎与翻译类抓取按该声明判定页面语言。zh 取 zh-CN，与静态 index.html 默认值一致。
 */
function applyDocumentLang(locale: Locale): void {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
}

/**
 * 语言包按命名空间拆分为 locales/<lang>/*.json（文件名即命名空间），
 * 每个分类一个 tools-*.json，多分类并行开发互不冲突（agent.md §9）。
 *
 * 必须 eager：非 eager 会把 28 个 JSON 变成 28 个运行时请求，而启动流程要等它们全部
 * 落地才挂载。线上实测这些请求要等主包执行完（≈2s）才发出，再各自吃一次边缘延迟，
 * 首屏被拖到 ≈3.7s。中英两套反正都要（命令面板跨语言即时搜索），打进产物图换来的是
 * 少 28 个往返——在高延迟的边缘节点上，省往返比省字节划算得多。
 */
const localeModules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>

const resources = { zh: {}, en: {} } as Record<Locale, Record<string, Record<string, unknown>>>

for (const [file, mod] of Object.entries(localeModules)) {
  const matched = file.match(/locales\/(zh|en)\/([^/]+)\.json$/)
  const locale = matched?.[1] as Locale | undefined
  const namespace = matched?.[2]
  if (locale && namespace) {
    resources[locale][namespace] = mod.default
  }
}

/** 初始化 i18next：语言包已在模块图里，没有异步加载，挂载不必等待 */
export function initI18n(locale: Locale): void {
  i18next.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    resources,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    returnObjects: true,
    // 开发期暴露缺失键（命名空间=文件名约定：如 'not-found'，不是 'notFound'）
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (lngs, ns, key) => {
      console.warn(`[i18n] missing key: ${ns}:${key} (${lngs.join(',')})`)
    },
  })
  applyDocumentLang(locale)
  // 监听而非在 changeLocale 里各调一次：任何来源的语言切换（含 store 恢复）都会同步
  i18next.on('languageChanged', (lng) => applyDocumentLang(lng === 'en' ? 'en' : 'zh'))
}

/** 切换语言：两套语言已在产物里，只改偏好与当前语言 */
export function changeLocale(locale: Locale): void {
  usePreferencesStore.getState().setLocale(locale)
  void i18next.changeLanguage(locale)
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
