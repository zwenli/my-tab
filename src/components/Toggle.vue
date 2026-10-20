<script setup lang="ts">
/**
 * 开关控件（无障碍：role="switch" + 键盘可切换）。
 */
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
</script>

<template>
  <button
    class="sw"
    :class="{ on: modelValue }"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label || undefined"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="knob" />
  </button>
</template>

<style scoped>
.sw {
  flex: none;
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-3);
  cursor: pointer;
  padding: 0;
  transition: background var(--transition), border-color var(--transition);
}
.sw:hover:not(:disabled) {
  border-color: var(--text-dim);
}
.sw.on {
  background: var(--primary);
  border-color: var(--primary);
}
.sw:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform var(--transition);
}
.sw.on .knob {
  transform: translateX(16px);
}
</style>
