<script setup lang="ts">
/**
 * 轻量提示条：右下角堆叠，自动消失。
 */
import { useUiStore } from '@/stores/ui'
import Icon from './Icon.vue'

const ui = useUiStore()

const ICONS = {
  success: 'check-circle',
  error: 'x-circle',
  warning: 'alert-circle',
  info: 'info'
}
</script>

<template>
  <Teleport to="body">
    <div class="toasts" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="`t-${t.type}`">
          <Icon :name="ICONS[t.type] || 'info'" :size="16" class="ico" />
          <span class="msg">{{ t.message }}</span>
          <button v-if="t.action" class="btn btn-ghost btn-sm act" type="button" @click="t.action.onClick()">
            {{ t.action.label }}
          </button>
          <button class="btn btn-ghost btn-icon btn-sm close" type="button" aria-label="关闭" @click="ui.dismissToast(t.id)">
            <Icon name="x" :size="13" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 400;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
  max-width: min(420px, calc(100vw - 36px));
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 13px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-2);
  font-size: var(--text-sm);
  color: var(--text);
  max-width: 100%;
}
.msg {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ico {
  flex: none;
}
.t-success .ico {
  color: var(--success);
}
.t-error .ico {
  color: var(--danger);
}
.t-warning .ico {
  color: var(--warning);
}
.t-info .ico {
  color: var(--primary);
}
.close {
  color: var(--text-dim);
}
.act {
  flex: none;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--transition-slow), transform var(--transition-slow);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
