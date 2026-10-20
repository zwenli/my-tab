<script setup lang="ts">
/**
 * 空状态：图形 + 说明 + 可选主行动。
 */
import Icon from './Icon.vue'

defineProps({
  icon: { type: String, default: 'inbox' },
  title: { type: String, default: '' },
  hint: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})

defineEmits<{ (e: 'action'): void }>()
</script>

<template>
  <div class="empty" :class="{ compact }">
    <div class="art" aria-hidden="true">
      <span class="ring r1" />
      <span class="ring r2" />
      <span class="glyph"><Icon :name="icon" :size="compact ? 20 : 26" /></span>
    </div>
    <h3 v-if="title" class="t">{{ title }}</h3>
    <p v-if="hint" class="h">{{ hint }}</p>
    <button v-if="actionLabel" class="btn btn-primary" type="button" @click="$emit('action')">
      <Icon name="inbox" :size="15" />{{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 64px 24px;
  text-align: center;
}
.empty.compact {
  padding: 28px 18px;
}
.art {
  position: relative;
  width: 84px;
  height: 84px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
}
.compact .art {
  width: 60px;
  height: 60px;
}
.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid var(--border);
}
.r1 {
  inset: 0;
  background: radial-gradient(circle at 50% 40%, var(--primary-soft), transparent 70%);
}
.r2 {
  inset: 13px;
  border-style: dashed;
  opacity: 0.7;
}
.glyph {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--primary);
}
.compact .glyph {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}
.t {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}
.h {
  max-width: 420px;
  font-size: var(--text-base);
  color: var(--text-muted);
  line-height: 1.65;
}
.empty .btn {
  margin-top: 8px;
}
</style>
