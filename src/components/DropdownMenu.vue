<script setup lang="ts">
/**
 * 通用下拉菜单：点击触发按钮弹出，支持键盘导航与点击外部关闭。
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
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
const menu = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)

function toggle(): void {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    activeIndex.value = props.items.findIndex((i) => !i.separator && !i.disabled)
    void nextTick(() => menu.value?.querySelector<HTMLElement>('[data-item]')?.focus())
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
  if (root.value && !root.value.contains(e.target as Node)) close()
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
      nodes?.[next]?.focus()
    })
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (activeIndex.value >= 0) {
      e.preventDefault()
      choose(props.items[activeIndex.value])
    }
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey, true)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKey, true)
})

defineExpose({ close, open: (): void => void (open.value = true) })
</script>

<template>
  <span ref="root" class="dd">
    <button
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

    <Transition name="dd">
      <div
        v-if="open"
        ref="menu"
        class="menu"
        :class="[align, placement]"
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
.menu {
  position: absolute;
  z-index: 120;
  min-width: 178px;
  padding: 5px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-3);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.menu.bottom {
  top: calc(100% + 6px);
}
.menu.top {
  bottom: calc(100% + 6px);
}
.menu.end {
  right: 0;
}
.menu.start {
  left: 0;
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
