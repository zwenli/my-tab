<script setup lang="ts">
/**
 * 设置项行：左侧标题 + 说明，右侧控件（开关 / 下拉 / 自定义插槽）。
 */
import type { PropType } from 'vue'
import Toggle from './Toggle.vue'
import type { SelectOption } from '@/types'

defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  /** 'boolean' | 'select' | 'slot' */
  type: { type: String, default: 'boolean' },
  modelValue: { type: [Boolean, String, Number] as PropType<boolean | string | number>, default: false },
  options: { type: Array as PropType<SelectOption[]>, default: () => [] }
})

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean | string | number): void }>()

/** 下拉选择：把 DOM 事件转成纯值 */
function onSelectChange(e: Event): void {
  emit('update:modelValue', (e.target as HTMLSelectElement | null)?.value ?? '')
}
</script>

<template>
  <div class="row">
    <div class="text">
      <label class="lbl">{{ label }}</label>
      <p v-if="hint" class="hint">{{ hint }}</p>
    </div>
    <div class="ctl">
      <Toggle
        v-if="type === 'boolean'"
        :model-value="!!modelValue"
        :label="label"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <select
        v-else-if="type === 'select'"
        class="select sel"
        :value="modelValue"
        :aria-label="label"
        @change="onSelectChange($event)"
      >
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <slot v-else />
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-soft);
}
.row:last-child {
  border-bottom: 0;
}
.text {
  flex: 1;
  min-width: 0;
}
.lbl {
  display: block;
  font-size: var(--text-base);
  color: var(--text);
  cursor: pointer;
}
.hint {
  margin-top: 3px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.5;
}
.ctl {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sel {
  width: auto;
  min-width: 130px;
}
@media (max-width: 560px) {
  .row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .ctl {
    justify-content: flex-start;
  }
  .sel {
    width: 100%;
  }
}
</style>
