/**
 * 轻量 i18n：模块级字典 + 运行时切换，不依赖任何第三方库。
 * 之所以不用 chrome.i18n，是因为 chrome.i18n 无法在运行时切换语言。
 */
import enUS from './en-US'
import zhCN from './zh-CN'
import type { Messages } from './messages'
import type { LanguagePref } from '@/types'

export interface LocaleOption {
  value: LanguagePref
  label: string
}

export const LOCALES: readonly LocaleOption[] = [
  { value: 'auto', label: '跟随系统 / Auto' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

const dictionaries: Record<string, Messages> = { 'zh-CN': zhCN, 'en-US': enUS }

export const SUPPORTED: readonly string[] = Object.keys(dictionaries)
export const DEFAULT_LOCALE = 'zh-CN'

/** 按浏览器语言猜测 */
export function detectLocale(): string {
  const lang = (globalThis.navigator?.language || DEFAULT_LOCALE).toLowerCase()
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US'
}

/** 把设置里的 language 偏好解析为具体语言 */
export function resolveLocale(pref: LanguagePref | string | undefined): string {
  if (pref && SUPPORTED.includes(pref)) return pref
  return detectLocale()
}

/**
 * 取文案。
 * @param key 点分层级键，如 'group.restoreAll'
 * @param params 占位符替换，如 { n: 3 }
 */
export function translate(locale: string, key: string, params?: Record<string, unknown>): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]!
  let text = dict[key] ?? dictionaries[DEFAULT_LOCALE]![key]
  if (text == null) return key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v ?? ''))
    }
  }
  return text
}

/** 语言显示名 */
export function localeLabel(value: LanguagePref | string): string {
  return LOCALES.find((l) => l.value === value)?.label ?? LOCALES[0]!.label
}

/** 生成一个绑定到具体语言的 t 函数 */
export function createTranslator(locale: string): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => translate(locale, key, params)
}
