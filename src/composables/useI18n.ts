/**
 * 国际化组合式函数。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useDataStore } from '@/stores/data'
import { detectLocale, localeLabel, resolveLocale, translate } from '@/i18n'

export type Translator = (key: string, params?: Record<string, unknown>) => string

export interface I18nContext {
  t: Translator
  locale: ComputedRef<string>
  isZh: ComputedRef<boolean>
  dateLocale: ComputedRef<string>
  detectLocale: typeof detectLocale
  localeLabel: typeof localeLabel
}

export function useI18n(): I18nContext {
  const data = useDataStore()

  const locale = computed<string>(() => resolveLocale(data.settings.language))
  const isZh = computed<boolean>(() => locale.value.startsWith('zh'))

  const t: Translator = (key, params) => translate(locale.value, key, params)

  /** 时间格式化使用的 locale 串 */
  const dateLocale = computed<string>(() => (isZh.value ? 'zh-CN' : 'en-US'))

  return { t, locale, isZh, dateLocale, detectLocale, localeLabel }
}
