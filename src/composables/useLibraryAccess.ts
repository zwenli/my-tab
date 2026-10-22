/**
 * 资料库访问的两个界面能力：
 *
 * 1. `useLibraryAccess()` —— 把「连接状态」翻译成界面要区分的三种情况
 *    （没绑过 / 绑过但需要重新确认 / 授权被拒），并提供「恢复访问」动作。
 * 2. `useLibraryAutoRestore()` —— 浏览器重启后授权会退成 prompt，此时在**本次页面的第一次
 *    用户手势**里自动补一次授权。成功的话用户什么都不用做，顶部提示条自己就消失了；
 *    失败（用户点了拒绝）就留在那里，等他手动点。
 *
 * 为什么必须挂在手势上：`requestPermission()` 需要 user activation，页面加载时调用会被
 * 浏览器直接拒绝（NotAllowedError）。但已保存的句柄还在 IndexedDB 里，所以这一次调用
 * **不会**弹文件夹选择器，只会问一句「是否继续允许访问」。
 */
import { computed, onBeforeUnmount, watch, type ComputedRef } from 'vue'
import { useDataStore } from '@/stores/data'
import { useActions } from '@/composables/useActions'
import { libraryAccessLevel } from '@/core/library'
import type { LibraryAccessLevel } from '@/types'

export interface UseLibraryAccessApi {
  /** 当前访问等级 */
  level: ComputedRef<LibraryAccessLevel>
  /** 绑定还在，只差一次重新确认 */
  needsConfirm: ComputedRef<boolean>
  /** 授权被拒 / 句柄失效，只能重新选择文件夹 */
  denied: ComputedRef<boolean>
  /** 正在恢复中 */
  restoring: ComputedRef<boolean>
  /** 恢复访问（需在点击里调用） */
  restore: () => Promise<boolean>
}

export function useLibraryAccess(): UseLibraryAccessApi {
  const data = useDataStore()
  const actions = useActions()

  const level = computed<LibraryAccessLevel>(() => libraryAccessLevel(data.library))
  const needsConfirm = computed<boolean>(() => level.value === 'needs-grant')
  const denied = computed<boolean>(() => level.value === 'denied')
  const restoring = computed<boolean>(() => data.restoring)

  const restore = async (): Promise<boolean> => {
    const res = await actions.restoreLibraryAccess()
    return res.ok
  }

  return { level, needsConfirm, denied, restoring, restore }
}

/**
 * 在本次页面的第一次用户手势里自动补一次资料库授权。
 * 只在「绑定还在、只差确认」时动作；其它情况一律不动。
 */
export function useLibraryAutoRestore(): void {
  const data = useDataStore()
  const actions = useActions()

  let detach: (() => void) | null = null
  let spent = false

  const stop = (): void => {
    detach?.()
    detach = null
  }

  const onGesture = (e: Event): void => {
    stop()
    if (spent) return
    spent = true
    // 点在提示条上就交给它自己的按钮处理，别抢跑（否则会吞掉成功提示）
    const target = e.target as Element | null
    if (target?.closest?.('.lib-bar')) return
    // 手势之前状态可能还没读出来，这里再确认一次
    if (libraryAccessLevel(data.library) !== 'needs-grant') return
    void actions.restoreLibraryAccess({ silent: true })
  }

  const arm = (): void => {
    if (detach || spent) return
    window.addEventListener('pointerdown', onGesture, true)
    detach = () => window.removeEventListener('pointerdown', onGesture, true)
  }

  watch(
    () => libraryAccessLevel(data.library) === 'needs-grant',
    (v) => {
      if (v) arm()
      else stop()
    },
    { immediate: true }
  )

  onBeforeUnmount(stop)
}
