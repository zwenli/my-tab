<script setup lang="ts">
/**
 * 输入弹窗：用于重命名、新建文件夹、编辑备注（多行）。
 */
import { ref } from 'vue'
import Modal from '../Modal.vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  value: { type: String, default: '' },
  multiline: { type: Boolean, default: false },
  rows: { type: Number, default: 4 },
  confirmText: { type: String, default: '' },
  onConfirm: { type: Function, default: null }
})

const emit = defineEmits(['close'])
const { t } = useI18n()

const text = ref(props.value ?? '')

function submit() {
  props.onConfirm?.(text.value)
  emit('close')
}
</script>

<template>
  <Modal :open="true" :title="title" :subtitle="subtitle" :width="500" @close="emit('close')">
    <label v-if="label" class="lbl">{{ label }}</label>
    <textarea
      v-if="multiline"
      v-model="text"
      class="input textarea"
      :rows="rows"
      :placeholder="placeholder"
      data-autofocus
      @keydown.meta.enter="submit"
      @keydown.ctrl.enter="submit"
    />
    <input
      v-else
      v-model="text"
      class="input"
      type="text"
      :placeholder="placeholder"
      data-autofocus
      @keydown.enter="submit"
    />
    <template #footer>
      <span class="hint">{{ multiline ? '⌘/Ctrl + Enter' : 'Enter' }} {{ t('common.confirm') }}</span>
      <span class="spacer" />
      <button class="btn" type="button" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button class="btn btn-primary" type="button" @click="submit">{{ confirmText || t('common.save') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.lbl {
  display: block;
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-bottom: 6px;
}
.hint {
  font-size: var(--text-xs);
  color: var(--text-dim);
}
</style>
