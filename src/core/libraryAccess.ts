/**
 * 资料库访问状态判定（纯函数，不碰 DOM / IndexedDB，可被 vitest 直接引用）。
 *
 * 为什么要把 `needs-grant` 单独列出来：
 * Chrome 对 File System Access 的授权是**按会话**的 —— 关掉这个来源的最后一批标签页
 * （典型场景就是关掉浏览器再打开）之后，授权会退回 `prompt`，
 * **但 IndexedDB 里的目录句柄依然有效**，绑定并没有丢。
 *
 * 旧代码直接用 `permission === 'granted'` 判断 `connected`，于是重启后界面显示
 * 「尚未连接资料库」，用户以为绑定失效，只能重新选一遍文件夹。
 * 正确的口径是三种状态分明：没绑过 / 绑过但需要重新确认 / 授权被拒。
 */
import type { LibraryAccessLevel } from '../types'

export type { LibraryAccessLevel }

/** 由状态快照推导访问等级 */
export function libraryAccessLevel(status: {
  supported: boolean
  hasDir: boolean
  permission: string
}): LibraryAccessLevel {
  if (!status.supported) return 'unsupported'
  if (!status.hasDir) return 'unbound'
  if (status.permission === 'granted') return 'ok'
  if (status.permission === 'denied' || status.permission === 'error') return 'denied'
  return 'needs-grant'
}

/** 是否需要「恢复访问」这种轻量动作（而不是重新选择文件夹） */
export const isRestorable = (level: LibraryAccessLevel): boolean => level === 'needs-grant'
