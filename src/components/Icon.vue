<script setup lang="ts">
/**
 * 内联图标集（线性风格，24×24 网格，stroke 使用 currentColor）。
 * 全部内联，避免任何网络请求，符合扩展 CSP。
 */
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 1.8 },
  /** 实心填充（用于星标等） */
  filled: { type: Boolean, default: false }
})

const PATHS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-up': '<path d="M18 15l-6-6-6 6"/>',
  'chevron-right': '<path d="M9 18l6-6-6-6"/>',
  'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
  'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
  'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
  'corner-down-right': '<path d="M15 10l5 5-5 5"/><path d="M4 4v7a4 4 0 004 4h12"/>',
  'more-horizontal': '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  'more-vertical': '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  'grip-vertical': '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  folder: '<path d="M3 7.5A2 2 0 015 5.5h3.6a2 2 0 011.6.8l1 1.4H19a2 2 0 012 2v7.8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  'folder-plus': '<path d="M3 7.5A2 2 0 015 5.5h3.6a2 2 0 011.6.8l1 1.4H19a2 2 0 012 2v7.8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 11.5v5M9.5 14h5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  inbox: '<path d="M3 12h4l2 3h6l2-3h4"/><path d="M5.5 5h13l2.5 7v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.2"/><circle cx="3.6" cy="12" r="1.2"/><circle cx="3.6" cy="18" r="1.2"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.95 6.75 19.75l1-5.85L3.5 9.75l5.9-.85z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 017.4-2"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7"/><path d="M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 5.5A2.5 2.5 0 0012.5 3h-6A3.5 3.5 0 003 6.5v6A2.5 2.5 0 005.5 15"/>',
  link: '<path d="M10 13.5a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.3 1.3"/><path d="M14 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.3-1.3"/>',
  'external-link': '<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v4.5A2.5 2.5 0 0115.5 21h-9A2.5 2.5 0 014 18.5v-9A2.5 2.5 0 016.5 7H11"/>',
  download: '<path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 17.5v1a2.5 2.5 0 002.5 2.5h11a2.5 2.5 0 002.5-2.5v-1"/>',
  upload: '<path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M4 17.5v1a2.5 2.5 0 002.5 2.5h11a2.5 2.5 0 002.5-2.5v-1"/>',
  share: '<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008.9 19.3a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.1A1.7 1.7 0 004.7 8.9a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001.03-1.56V3a2 2 0 114 0v.1A1.7 1.7 0 0015.1 4.7a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 9v.1a1.7 1.7 0 001.56 1.03H21a2 2 0 110 4h-.1A1.7 1.7 0 0019.4 15z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 019.8 3.5a8.5 8.5 0 1010.7 10.7z"/>',
  monitor: '<rect x="2.8" y="4" width="18.4" height="12.6" rx="2"/><path d="M8.5 20.5h7M12 16.6v3.9"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  note: '<path d="M20 14.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h8.5L20 14.5z"/><path d="M8 9h8M8 13h5"/>',
  'check-square': '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/><path d="M8 12.2l2.6 2.6L16.4 9"/>',
  square: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/>',
  'alert-circle': '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.8v5M12 16.2h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.6"/><path d="M8.4 12.2l2.6 2.6 4.6-5"/>',
  'x-circle': '<circle cx="12" cy="12" r="8.6"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2M12 7.8h.01"/>',
  'refresh-cw': '<path d="M20.5 11a8.5 8.5 0 00-14.6-5.3L3.5 8"/><path d="M3.5 4v4.2h4.2"/><path d="M3.5 13a8.5 8.5 0 0014.6 5.3l2.4-2.3"/><path d="M20.5 20v-4.2h-4.2"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/><path d="M12 3.4c2.2 2.5 3.3 5.4 3.3 8.6S14.2 18.1 12 20.6C9.8 18.1 8.7 15.2 8.7 12S9.8 5.9 12 3.4z"/>',
  palette: '<path d="M12 3.4a8.6 8.6 0 000 17.2c1.2 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.4-.7-.4-1.1 0-1 .8-1.7 1.8-1.7h1.4a4.4 4.4 0 004.4-4.4c0-3.9-3.9-7-8.6-7z"/><circle cx="7.6" cy="12" r="1.1"/><circle cx="9.9" cy="8.2" r="1.1"/><circle cx="14.1" cy="8.2" r="1.1"/>',
  'hard-drive': '<path d="M3.5 13.5h17"/><path d="M5.6 5.5h12.8l2.1 8v4a2 2 0 01-2 2H5.5a2 2 0 01-2-2v-4z"/><circle cx="7.2" cy="16.4" r="0.9"/>',
  keyboard: '<rect x="2.6" y="6" width="18.8" height="12" rx="2.2"/><path d="M6 9.6h.01M9.5 9.6h.01M13 9.6h.01M16.5 9.6h.01M6 13h.01M18 13h.01M9 13h6"/>',
  shield: '<path d="M12 3.5l7 2.6v5c0 4.2-2.9 7.9-7 9.4-4.1-1.5-7-5.2-7-9.4v-5z"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  'maximize-2': '<path d="M14.5 3.5H20.5v6"/><path d="M9.5 20.5H3.5v-6"/><path d="M20.5 3.5L14 10"/><path d="M3.5 20.5L10 14"/>',
  'minimize-2': '<path d="M3.5 9.5H9.5V3.5"/><path d="M20.5 14.5H14.5v6"/><path d="M9.5 9.5L3.5 3.5"/><path d="M14.5 14.5l6 6"/>',
  filter: '<path d="M3.5 5.5h17l-6.6 7.6v5.4l-3.8 2v-7.4z"/>',
  pin: '<path d="M12 17.5V21"/><path d="M8.5 3.5h7l-.8 5.2 2.6 3.1H6.7l2.6-3.1z"/>',
  zap: '<path d="M13.2 2.5L4.8 13.4h6.2l-1.2 8.1 8.4-10.9h-6.2z"/>',
  sparkles: '<path d="M12 3.5l1.7 4.3L18 9.5l-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  'file-text': '<path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z"/><path d="M14 3.5v5h5"/><path d="M9 13h6M9 16.5h4"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V19a1.8 1.8 0 01-1.8 1.8H5.8A1.8 1.8 0 014 19z"/><path d="M9.5 20.8v-6.4h5v6.4"/>',
  'trash-2': '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4L17.5 7"/><path d="M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7"/>'
}

const inner = computed(() => PATHS[props.name] || PATHS.info)
const px = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <svg
    class="icon"
    :width="px"
    :height="px"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    :stroke="filled ? 'none' : 'currentColor'"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="inner"
  />
</template>

<style scoped>
.icon {
  flex: none;
  display: block;
  overflow: visible;
}
</style>
