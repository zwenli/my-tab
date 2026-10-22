<script setup lang="ts">
/**
 * 通用下拉菜单：点击触发按钮弹出，支持键盘导航与点击外部关闭。
 *
 * 菜单**渲染到 <body> 上并 fixed 定位**（与 v-tip 同一套路）：只要挂在原地，
 * 任何带 overflow 的祖先（多选操作条的横向滚动、卡片列表的滚动容器…）都会把
 * 它裁掉 —— 表现就是「点了没反应 / 菜单被遮住」。定位按触发按钮的视口矩形算，
 * 并做视口夹取与上下翻转。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import type { MenuItem } from '@/types'
import type { TipDir } from '@/directives'

const props = withDefaults(
  defineProps<{
    /** 菜单项；separator 为真时渲染为分隔线 */
    items?: MenuItem[]
    align?: 'start' | 'end' | 'center'
    placement?: 'top' | 'bottom'
    label?: string
    icon?: string
    variant?: string
    size?: 'sm' | 'md'
    tip?: string
    /** 气泡方向：auto 自动避让，顶栏建议 bottom */
    tipDir?: TipDir
    disabled?: boolean
  }>(),
  {
    items: () => [],
    align: 'end',
    placement: 'bottom',
    label: '',
    icon: 'more-horizontal',
    variant: 'ghost',
    size: 'sm',
    tip: '',
    tipDir: 'auto',
    disabled: false
  }
)

const emit = defineEmits<{ (e: 'select', key: string, item: MenuItem): void }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)
/** 菜单的视口坐标（fixed 定位） */
const pos = ref({ top: 0, left: 0 })

const GAP = 6
const EDGE = 8

/** 按触发按钮位置 + 菜单实际尺寸算坐标：先按 placement 摆，再夹进视口，放不下就翻面 */
function place(): void {
  const btn = trigger.value
  const el = menu.value
  if (!btn || !el) return

  const r = btn.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight

  let top = props.placement === 'top' ? r.top - h - GAP : r.bottom + GAP
  const fitsAbove = r.top - h - GAP >= EDGE
  const fitsBelow = r.bottom + GAP + h <= window.innerHeight - EDGE
  if (props.placement === 'top' && !fitsAbove && fitsBelow) top = r.bottom + GAP
  else if (props.placement !== 'top' && !fitsBelow && fitsAbove) top = r.top - h - GAP
  top = Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE))

  let left =
    props.align === 'end' ? r.right - w : props.align === 'center' ? r.left + r.width / 2 - w / 2 : r.left
  left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE))

  pos.value = { top, left }
}

function toggle(): void {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    activeIndex.value = props.items.findIndex((i) => !i.separator && !i.disabled)
    void nextTick(() => {
      place()
      menu.value?.querySelector<HTMLElement>('[data-item]')?.focus({ preventScroll: true })
    })
  }
}

function close(): void {
  open.value = false
}

function choose(item: MenuItem | undefined): void {
  if (!item || item.separator || item.disabled) return
  close()
  emit('select', item.key ?? '', item)
}

function onDocClick(e: MouseEvent): void {
  if (!open.value) return
  const t = e.target as Node
  // 菜单已 teleport 到 body，不再是 root 的后代，必须单独判断
  if (root.value?.contains(t) || menu.value?.contains(t)) return
  close()
}

/** 滚动（含任意内层滚动容器）与窗口尺寸变化时跟着走，否则菜单会跟丢按钮 */
function onViewportChange(): void {
  if (open.value) place()
}

function onKey(e: KeyboardEvent): void {
  if (!open.value) return
  const pickable = props.items.map((it, i) => (it.separator || it.disabled ? -1 : i)).filter((i) => i >= 0)
  if (!pickable.length) return

  if (e.key === 'Escape') {
    close()
    e.stopPropagation()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const cur = pickable.indexOf(activeIndex.value)
    const next = e.key === 'ArrowDown' ? (cur + 1) % pickable.length : (cur - 1 + pickable.length) % pickable.length
    activeIndex.value = pickable[next] ?? -1
    void nextTick(() => {
      const nodes = menu.value?.querySelectorAll<HTMLElement>('[data-item]')
      nodes?.[next]?.focus({ preventScroll: true })
    })
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (activeIndex.value >= 0) {
      e.preventDefault()
      choose(props.items[activeIndex.value])
    }
  }
}

/** 菜单项变化（组列表增删）会改变高度，重算一次 */
watch(
  () => props.items,
  () => {
    if (open.value) void nextTick(place)
  }
)

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})

defineExpose({ close, open: (): void => void (open.value = true) })
</script>

<template>
  <span ref="root" class="dd">
    <button
      ref="trigger"
      class="btn trigger"
      :class="[`btn-${variant}`, size === 'sm' ? 'btn-sm' : '', !label ? 'btn-icon' : '']"
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      v-tip="tip ? { text: tip, dir: tipDir } : undefined"
      :disabled="disabled"
      @click.stop="toggle"
    >
      <Icon :name="icon" :size="size === 'sm' ? 15 : 16" />
      <span v-if="label" class="lbl">{{ label }}</span>
    </button>

    <Teleport to="body">
      <Transition name="dd">
        <div
          v-if="open"
          ref="menu"
          class="menu"
          :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
          role="menu"
          @click.stop
        >
          <template v-for="(item, i) in items" :key="item.key || i">
            <div v-if="item.separator" class="sep" role="separator" />
            <button
              v-else
              data-item
              class="mi"
              :class="{ danger: item.danger, disabled: item.disabled }"
              type="button"
              role="menuitem"
              :disabled="item.disabled"
              @click="choose(item)"
            >
              <Icon v-if="item.icon" :name="item.icon" :size="15" class="mi-ico" />
              <span class="mi-lbl">{{ item.label }}</span>
              <Icon v-if="item.checked" name="check" :size="14" class="mi-check" />
            </button>
          </template>
          <div v-if="!items.length" class="mi disabled">—</div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.dd {
  position: relative;
  display: inline-flex;
}
.trigger {
  height: 28px;
}
/* fixed + body 层：不受任何祖先 overflow 裁剪；z-index 高于弹窗(200)、低于气泡(300)与 Toast(400) */
.menu {
  position: fixed;
  z-index: 250;
  min-width: 178px;
  max-width: min(320px, calc(100vw - 16px));
  max-height: min(60vh, 420px);
  overflow-y: auto;
  padding: 5px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-3);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mi {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}
.mi:hover:not(.disabled),
.mi:focus-visible {
  background: var(--surface-3);
  color: var(--text);
}
.mi.danger {
  color: var(--danger);
}
.mi.danger:hover {
  background: var(--danger-soft);
}
.mi.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mi-ico {
  flex: none;
  opacity: 0.9;
}
.mi-lbl {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mi-check {
  color: var(--primary);
}
.sep {
  height: 1px;
  background: var(--border);
  margin: 4px 5px;
}

.dd-enter-active,
.dd-leave-active {
  transition: opacity var(--transition), transform var(--transition);
}
.dd-enter-from,
.dd-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
