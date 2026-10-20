<script setup lang="ts">
/**
 * 确认弹窗。
 */
import Modal from '../Modal.vue'
import Icon from '../Icon.vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps({
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  detail: { type: String, default: '' },
  confirmText: { type: String, default: '' },
  cancelText: { type: String, default: '' },
  danger: { type: Boolean, default: false },
  icon: { type: String, default: 'alert-circle' },
  onConfirm: { type: Function, default: null }
})

const emit = defineEmits(['close'])
const { t } = useI18n()

function confirm() {
  props.onConfirm?.()
  emit('close')
}
</script>

<template>
  <Modal :open="true" :title="title" :width="440" @close="emit('close')">
    <div class="content">
      <div class="ico" :class="{ danger }">
        <Icon :name="icon" :size="20" />
      </div>
      <div class="text">
        <p v-if="message" class="msg">{{ message }}</p>
        <p v-if="detail" class="detail">{{ detail }}</p>
      </div>
    </div>
    <template #footer>
      <span class="spacer" />
      <button class="btn" type="button" @click="emit('close')">{{ cancelText || t('common.cancel') }}</button>
      <button
        class="btn"
        :class="danger ? 'btn-danger-solid' : 'btn-primary'"
        type="button"
        data-autofocus
        @click="confirm"
      >
        {{ confirmText || t('common.confirm') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.content {
  display: flex;
  gap: 14px;
  padding-top: 4px;
}
.ico {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--warning-soft);
  color: var(--warning);
}
.ico.danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.text {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}
.msg {
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
}
.detail {
  margin-top: 8px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.55;
}
.btn-danger-solid {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.btn-danger-solid:hover {
  filter: brightness(1.08);
  border-color: var(--danger);
}
</style>
