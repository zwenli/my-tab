/**
 * 通用工具函数。无任何平台 API 依赖，可在 service worker / 页面 / 测试中通用。
 */

/** 带取消能力的防抖函数 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void
  cancel(): void
  flush(...args: A): void
}

/** 生成 uuid v4（webcrypto，MV3 与页面均可用） */
export function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 当前时间戳（毫秒） */
export const now = (): number => Date.now()

/** 浅拷贝（仅一层，够用且无序列化开销） */
export const shallow = <T extends object>(obj: T): T => ({ ...obj })

/** 深拷贝（结构化克隆优先，回退 JSON） */
export function deepClone<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

/** 防抖 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 300): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = ((...args: A): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, wait)
  }) as Debounced<A>
  wrapped.cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  wrapped.flush = (...args: A): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      fn(...args)
    }
  }
  return wrapped
}

/** 节流（首帧立即执行） */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, wait = 100): (...args: A) => void {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: A): void => {
    const t = Date.now()
    const remain = wait - (t - last)
    if (remain <= 0) {
      last = t
      fn(...args)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn(...args)
      }, remain)
    }
  }
}

/** 数组去重（按 id） */
export function uniqueById<T extends { id: string }>(list: readonly T[] = []): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of list) {
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/** 数组元素移动（返回新数组） */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice()
  if (from < 0 || from >= out.length) return out
  const clampedTo = Math.max(0, Math.min(out.length - 1, to))
  const [item] = out.splice(from, 1)
  out.splice(clampedTo, 0, item as T)
  return out
}

/** 分组（按 key 函数） */
export function groupBy<T, K>(list: readonly T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of list) {
    const key = keyFn(item)
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }
  return map
}

/** 从 URL 提取主机名，失败时回退原串 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url || ''
  }
}

/** 取 URL 的 favicon（扩展自身 favicon 权限可用时优先，否则用站点 /favicon.ico） */
export function faviconUrlOf(url: string, size = 32): string {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return ''
    const ext = globalThis.chrome?.runtime?.getURL
    if (ext) {
      const target = `${u.origin}${u.pathname}${u.search}`
      return `${ext('_favicon/')}?pageUrl=${encodeURIComponent(target)}&size=${size}`
    }
    return `${u.origin}/favicon.ico`
  } catch {
    return ''
  }
}

/** 首字母（用于无图标时的占位） */
export function initialOf(text = ''): string {
  const t = String(text).trim()
  if (!t) return '#'
  const m = t.match(/[\u4e00-\u9fa5]/)
  return m ? m[0]! : t[0]!.toUpperCase()
}

/** 从字符串稳定派生一个色相（用于无图标占位色块） */
export function hueOf(text = ''): number {
  let h = 0
  const s = String(text)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

/** 人性化时间：刚刚 / 5 分钟前 / 昨天 / 2026-01-02 */
export function humanTime(ts: number, locale = 'zh-CN'): string {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = Date.now() - ts
  const zh = locale.startsWith('zh')
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return zh ? '刚刚' : 'just now'
  if (diff < hour) return zh ? `${Math.floor(diff / min)} 分钟前` : `${Math.floor(diff / min)} min ago`
  if (diff < day) return zh ? `${Math.floor(diff / hour)} 小时前` : `${Math.floor(diff / hour)} h ago`
  if (diff < 2 * day) return zh ? '昨天' : 'yesterday'
  if (diff < 7 * day) return zh ? `${Math.floor(diff / day)} 天前` : `${Math.floor(diff / day)} d ago`
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 格式化完整时间；`withSeconds` 用于默认组名这类需要避免重名的场景 */
export function formatDateTime(ts: number, withSeconds = false): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withSeconds ? `${stamp}:${pad(d.getSeconds())}` : stamp
}

/** 字节数人性化 */
export function humanBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** 安全 JSON 解析 */
export function safeParse<T = unknown>(text: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/** 复制文本到剪贴板（页面上下文） */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 回退 */
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}

/** 校验是否可作为标签收集的 URL */
export function isCollectableUrl(url = ''): boolean {
  if (!url) return false
  if (/^(chrome|edge|about|devtools|chrome-extension|moz-extension|brave|vivaldi|opera):/i.test(url)) return false
  if (/^https?:\/\/(chrome|edge|about|newtab)/i.test(url)) return false
  return /^https?:/i.test(url)
}

/** 休眠 */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
