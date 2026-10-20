/**
 * v-tip —— 轻量提示气泡指令。
 *
 * 旧实现是 `.tip::after` 纯 CSS 伪元素，气泡跟随元素定位，因此有两个天生缺陷：
 *  1) 会被祖先的 overflow 裁剪（卡片、滚动容器、弹窗内）；
 *  2) 顶栏这类贴着窗口上沿的按钮，气泡默认朝上，会直接被窗口边缘 / 遮罩吃掉。
 *
 * 新实现把气泡挂在 <body> 上、用 fixed 定位并抬高 z-index：
 *  - 不会被任何父级裁剪；
 *  - 层级高于菜单(120)、多选条(150)、弹窗(200)，不会被遮罩盖住；
 *  - 支持方向控制 direction，且默认 auto：按可视区剩余空间自动翻转 + 边界夹取。
 *
 * 用法：
 *   v-tip="'新建分组'"                                  // 自动方向
 *   v-tip:bottom="'新建分组'"                            // 显式方向：top/bottom/left/right/auto
 *   v-tip.top="'新建分组'"                              // 也可以用修饰符
 *   v-tip="{ text: '新建分组', dir: 'right', gap: 10, delay: 250 }"
 */
import type { Directive, DirectiveBinding } from 'vue'
import { resolveTipDir, resolveTipPos, TIP_GAP, type TipDir, type TipViewport } from './tipGeometry'

export type { TipDir }

export interface TipOptions {
  /** 气泡文案 */
  text: string
  /** 方向，默认 auto（自动检测） */
  dir?: TipDir
  /** 与触发元素的间距，默认 8px */
  gap?: number
  /** 悬停多久后出现，默认 150ms；0 表示立即 */
  delay?: number
}

export type TipValue = string | TipOptions | null | undefined

interface TipState {
  text: string
  dir: TipDir
  gap: number
  delay: number
}

const DIRS: TipDir[] = ['auto', 'top', 'bottom', 'left', 'right']
const DEFAULT_DELAY = 150
/** 移出后延迟隐藏，避免在相邻按钮间移动时闪烁 */
const HIDE_DELAY = 80

const tips = new WeakMap<HTMLElement, TipState>()

let bubble: HTMLDivElement | null = null
let shownEl: HTMLElement | null = null
let showTimer = 0
let hideTimer = 0
let listening = false

function normalizeDir(v: string | undefined): TipDir {
  return v && (DIRS as string[]).includes(v) ? (v as TipDir) : 'auto'
}

function viewport(): TipViewport {
  return { vw: window.innerWidth, vh: window.innerHeight }
}

/* ------------------------- 气泡节点 ------------------------- */

function ensureBubble(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  if (bubble?.isConnected) return bubble
  const el = document.createElement('div')
  el.className = 'tip-bubble'
  el.setAttribute('role', 'tooltip')
  document.body.appendChild(el)
  bubble = el
  return el
}

function paint(el: HTMLElement, state: TipState): void {
  const b = ensureBubble()
  if (!b) return
  if (!el.isConnected) {
    hide()
    return
  }

  b.textContent = state.text
  b.classList.remove('is-on')

  // 先写入文本量出尺寸，再定方向与坐标，避免出现「先画错再跳」的观感
  const rect = el.getBoundingClientRect()
  const bw = b.offsetWidth
  const bh = b.offsetHeight
  const view = viewport()
  const dir = resolveTipDir(rect, bw, bh, state.dir, state.gap, view)
  const { x, y } = resolveTipPos(rect, bw, bh, dir, state.gap, view)

  b.dataset.dir = dir
  b.style.left = `${Math.round(x)}px`
  b.style.top = `${Math.round(y)}px`
  b.classList.add('is-on')
  shownEl = el
}

function hide(): void {
  window.clearTimeout(showTimer)
  window.clearTimeout(hideTimer)
  shownEl = null
  bubble?.classList.remove('is-on')
}

function hideSoon(): void {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hide, HIDE_DELAY)
}

function scheduleShow(el: HTMLElement, state: TipState): void {
  window.clearTimeout(showTimer)
  window.clearTimeout(hideTimer)
  if (state.delay <= 0) {
    paint(el, state)
    return
  }
  showTimer = window.setTimeout(() => paint(el, state), state.delay)
}

/* ------------------------- 事件（统一委托，避免每个按钮挂监听） ------------------------- */

function findHost(target: EventTarget | null): HTMLElement | null {
  let node = target as HTMLElement | null
  let depth = 0
  while (node && depth < 16) {
    if (tips.has(node)) return node
    node = node.parentElement
    depth++
  }
  return null
}

function onPointerOver(e: PointerEvent): void {
  const host = findHost(e.target)
  if (!host || host === shownEl) return
  const state = tips.get(host)
  if (state) scheduleShow(host, state)
}

function onPointerOut(e: PointerEvent): void {
  const host = findHost(e.target)
  if (!host || host !== shownEl) return
  const to = e.relatedTarget as Node | null
  if (to && host.contains(to)) return
  hideSoon()
}

function onFocusIn(e: FocusEvent): void {
  const host = findHost(e.target)
  if (!host || host === shownEl) return
  const state = tips.get(host)
  if (state) paint(host, state)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') hide()
}

function listen(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('pointerover', onPointerOver, true)
  document.addEventListener('pointerout', onPointerOut, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', hide, true)
  document.addEventListener('pointerdown', hide, true)
  document.addEventListener('keydown', onKeydown, true)
  // 任何滚动/缩放都会让坐标失效，直接收起
  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
}

/* ------------------------- 指令实现 ------------------------- */

function resolveState(binding: DirectiveBinding<TipValue>): TipState | null {
  const raw = binding.value
  if (raw == null) return null

  const opts: TipOptions = typeof raw === 'string' ? { text: raw } : raw
  const text = (opts.text ?? '').trim()
  if (!text) return null

  const dirFromModifier = DIRS.find((d) => binding.modifiers[d])
  return {
    text,
    dir: normalizeDir(binding.arg ?? dirFromModifier ?? opts.dir),
    gap: opts.gap ?? TIP_GAP,
    delay: opts.delay ?? DEFAULT_DELAY
  }
}

function apply(el: HTMLElement, binding: DirectiveBinding<TipValue>): void {
  const state = resolveState(binding)

  if (!state) {
    tips.delete(el)
    el.removeAttribute('data-tip')
    if (shownEl === el) hide()
    return
  }

  tips.set(el, state)
  // 保留 data-tip 属性：便于调试 / 既有 UI 脚本按属性选中元素
  el.setAttribute('data-tip', state.text)
  listen()
  if (shownEl === el) paint(el, state)
}

export const vTip: Directive<HTMLElement, TipValue> = {
  mounted(el, binding) {
    apply(el, binding)
  },
  updated(el, binding) {
    apply(el, binding)
  },
  unmounted(el) {
    tips.delete(el)
    el.removeAttribute('data-tip')
    if (shownEl === el) hide()
  }
}
