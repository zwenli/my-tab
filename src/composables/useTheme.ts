/**
 * 主题：把设置里的 theme（auto/dark/light）落到 <html data-theme>。
 */
import { computed, onMounted, onUnmounted, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useDataStore } from '@/stores/data'
import type { ThemePref } from '@/types'

export interface ThemeContext {
  pref: ComputedRef<ThemePref>
  isDark: ComputedRef<boolean>
  setTheme: (value: ThemePref) => void
  toggle: () => void
  apply: () => void
}

export function useTheme(): ThemeContext {
  const data = useDataStore()
  let media: MediaQueryList | null = null

  const pref = computed<ThemePref>(() => data.settings.theme || 'dark')

  const systemDark = (): boolean => !!globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  const resolved = (): 'dark' | 'light' => (pref.value === 'auto' ? (systemDark() ? 'dark' : 'light') : pref.value)

  const apply = (): void => {
    const theme = resolved()
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
  }

  const isDark = computed<boolean>(() => resolved() === 'dark')

  const setTheme = (value: ThemePref): void => {
    void data.updateSettings({ theme: value })
  }

  const toggle = (): void => setTheme(isDark.value ? 'light' : 'dark')

  onMounted(() => {
    apply()
    media = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null
    media?.addEventListener('change', apply)
  })

  onUnmounted(() => {
    media?.removeEventListener('change', apply)
  })

  watch(pref, apply, { immediate: true })

  return { pref, isDark, setTheme, toggle, apply }
}
