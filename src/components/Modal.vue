<script setup lang="ts">
/**
 * 基础模态框：遮罩 + 居中面板 + 焦点陷阱 + ESC 关闭。
 */
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  width: { type: [Number, String], default: 520 },
  closeOnOverlay: { type: Boolean, default: true },
  /** 是否显示底部操作区插槽 */
  bare: { type: Boolean, default: false }
})

const emit = defineEmits<{ (e: 'close'): void }>()

const panel = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

const onKeydown = (e: KeyboardEvent): void => {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key === 'Tab' && panel.value) {
    const focusables = panel.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (!focusables.length) return
    const list = Array.from(focusables).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
    if (!list.length) return
    const first = list[0]
    const last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onUnmounted(() => document.removeEventListener('keydown', onKeydown, true))

watch(
  () => props.open,
  async (v) => {
    if (v) {
      lastFocused = document.activeElement as HTMLElement | null
      await nextTick()
      const auto = panel.value?.querySelector<HTMLElement>('[data-autofocus]')
      if (auto) auto.focus()
      else panel.value?.querySelector<HTMLElement>('button, input')?.focus()
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      lastFocused?.focus?.()
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="overlay" @click.self="closeOnOverlay && emit('close')">
        <div
          ref="panel"
          class="panel"
          role="dialog"
          aria-modal="true"
          :style="{ maxWidth: typeof width === 'number' ? width + 'px' : width }"
        >
          <header v-if="title || $slots.header" class="head">
            <slot name="header">
              <div class="head-text">
                <h2 class="title">{{ title }}</h2>
                <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
              </div>
            </slot>
            <button class="btn btn-ghost btn-icon btn-sm close" type="button" aria-label="Close" @click="emit('close')">
              <Icon name="x" :size="15" />
            </button>
          </header>

          <div class="body" :class="{ bare }">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(6, 10, 14, 0.62);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.panel {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-3);
  max-height: min(86vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 12px;
  flex: none;
}
.head-text {
  flex: 1;
  min-width: 0;
}
.title {
  font-size: var(--text-lg);
  font-weight: 650;
  letter-spacing: -0.01em;
  margin: 0;
}
.subtitle {
  margin-top: 4px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.5;
}
.close {
  margin: -4px -4px 0 0;
  color: var(--text-muted);
}
.body {
  padding: 0 18px 18px;
  overflow: auto;
  flex: 1;
}
.body.bare {
  padding: 0;
}
.foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-soft);
  background: var(--surface);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-slow);
}
.modal-enter-active .panel,
.modal-leave-active .panel {
  transition: transform var(--transition-slow), opacity var(--transition-slow);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .panel,
.modal-leave-to .panel {
  transform: translateY(10px) scale(0.985);
  opacity: 0;
}
</style>
