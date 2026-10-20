<script setup lang="ts">
/**
 * 站点图标：优先使用 chrome://favicon2（需要 favicon 权限），
 * 失败时回退为「标题首字 + 由标题派生的色相」色块，保证视觉不乱。
 */
import { computed, ref, watch } from 'vue'
import { faviconUrlOf, hostOf, hueOf, initialOf } from '@/core/utils'

const props = defineProps({
  url: { type: String, default: '' },
  title: { type: String, default: '' },
  size: { type: Number, default: 16 },
  show: { type: Boolean, default: true }
})

const broken = ref(false)

const src = computed(() => (props.show && !broken.value ? faviconUrlOf(props.url, props.size * 2) : ''))

const label = computed(() => initialOf(props.title || hostOf(props.url)))
const hue = computed(() => hueOf(hostOf(props.url) || props.title || 'x'))

watch(
  () => props.url,
  () => {
    broken.value = false
  }
)
</script>

<template>
  <span class="fav" :style="{ width: size + 'px', height: size + 'px' }">
    <img
      v-if="src"
      :src="src"
      :alt="''"
      :width="size"
      :height="size"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="broken = true"
    />
    <span
      v-else
      class="fallback"
      :style="{
        background: `hsl(${hue} 42% 30%)`,
        color: `hsl(${hue} 78% 82%)`,
        fontSize: Math.max(8, Math.round(size * 0.62)) + 'px'
      }"
      >{{ label }}</span
    >
  </span>
</template>

<style scoped>
.fav {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  overflow: hidden;
  background: var(--surface-3);
  vertical-align: middle;
}
.fav img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  line-height: 1;
  user-select: none;
}
</style>
