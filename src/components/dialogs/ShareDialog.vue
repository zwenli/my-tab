<script setup lang="ts">
/**
 * 分享弹窗：把标签组变成一条链接 / 二维码 / 独立网页文件 / 纯文本。
 * —— 这是本扩展唯一会把数据对外输出的入口，且必须由用户主动点击触发。
 */
import { computed, onMounted, ref } from 'vue'
import type { PropType } from 'vue'
import Modal from '../Modal.vue'
import Icon from '../Icon.vue'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { useUiStore } from '@/stores/ui'
import { buildPayload, buildShareUrl, packPayload, qrCapacityOk, renderShareText, renderStandaloneHtml } from '@/core/share'
import { qrSvg } from '@/core/qrcode'
import { downloadFile } from '@/core/exportImport'
import type { SharePayload, TabItem } from '@/types'

const props = defineProps({
  groupId: { type: String, default: '' },
  items: { type: Array as PropType<TabItem[]>, default: () => [] },
  title: { type: String, default: '' },
  note: { type: String, default: '' }
})

const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useI18n()
const ui = useUiStore()
const actions = useActions()

const ready = ref<boolean>(false)
const url = ref<string>('')
const svg = ref<string>('')
const tooLong = ref<boolean>(false)

const payload = computed<SharePayload>(() => buildPayload({ title: props.title, note: props.note, items: props.items }))
const textContent = computed<string>(() => renderShareText(payload.value))

onMounted(async () => {
  const packed = await packPayload(payload.value)
  url.value = buildShareUrl(packed)
  tooLong.value = !qrCapacityOk(url.value)
  if (!tooLong.value) svg.value = qrSvg(url.value, { cellSize: 4, margin: 1 }) || ''
  ready.value = true
  if (!svg.value && !tooLong.value) tooLong.value = true
})

function copyLink(): void {
  actions.copyTextWithFeedback(url.value, 'common.copied')
}

function copyTextList(): void {
  actions.copyTextWithFeedback(textContent.value, 'common.copied')
}

function download(): void {
  const html = renderStandaloneHtml(payload.value)
  const name = `mytab-share-${(props.title || 'group').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)}.html`
  downloadFile(name, html, 'text/html')
  ui.toast(t('toast.indexExported'), 'success')
}

function preview(): void {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: url.value, active: true }, () => void chrome.runtime?.lastError)
  } else {
    window.open(url.value, '_blank', 'noopener')
  }
}

/** 聚焦时全选链接，方便直接复制 */
function selectAllText(e: FocusEvent): void {
  ;(e.target as HTMLInputElement | null)?.select()
}
</script>

<template>
  <Modal :open="true" :title="t('share.title')" :subtitle="t('share.subtitle')" :width="620" @close="emit('close')">
    <div class="meta">
      <Icon name="layers" :size="15" />
      <span class="truncate">{{ title || t('group.untitled') }}</span>
      <span class="dot">·</span>
      <span>{{ t('share.itemCount', { n: items.length }) }}</span>
    </div>

    <div class="grid">
      <!-- 二维码 -->
      <section class="qr-box">
        <div class="sec-title">{{ t('share.qr') }}</div>
        <div class="qr-frame">
          <div v-if="svg" class="qr" v-html="svg" />
          <div v-else-if="!ready" class="qr-ph">{{ t('common.loading') }}</div>
          <div v-else class="qr-ph warn">
            <Icon name="alert-circle" :size="18" />
            <span>{{ t('share.qrTooLong') }}</span>
          </div>
        </div>
      </section>

      <!-- 链接与操作 -->
      <section class="link-box">
        <div class="sec-title">{{ t('share.link') }}</div>
        <input class="input mono" type="text" readonly :value="url" @focus="selectAllText" />
        <p class="hint">{{ t('share.linkHint') }}</p>

        <div class="btns">
          <button class="btn btn-primary" type="button" @click="copyLink">
            <Icon name="link" :size="14" />{{ t('share.copyLink') }}
          </button>
          <button class="btn" type="button" @click="preview">
            <Icon name="eye" :size="14" />{{ t('share.openPreview') }}
          </button>
        </div>

        <div class="sec-title mt">{{ t('share.download') }}</div>
        <p class="hint">{{ t('share.downloadHint') }}</p>
        <div class="btns">
          <button class="btn" type="button" @click="download">
            <Icon name="download" :size="14" />{{ t('share.download') }}
          </button>
          <button class="btn" type="button" @click="copyTextList">
            <Icon name="file-text" :size="14" />{{ t('share.copyText') }}
          </button>
        </div>
      </section>
    </div>

    <details class="preview">
      <summary>{{ t('share.text') }}</summary>
      <pre class="mono">{{ textContent }}</pre>
    </details>

    <template #footer>
      <span class="spacer" />
      <button class="btn" type="button" @click="emit('close')">{{ t('common.close') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  padding: 2px 0 14px;
}
.meta .truncate {
  max-width: 60%;
  color: var(--text-secondary);
}
.dot {
  color: var(--text-dim);
}
.grid {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 18px;
  align-items: start;
}
@media (max-width: 560px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
.sec-title {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 8px;
}
.sec-title.mt {
  margin-top: 18px;
}
.qr-frame {
  background: #fff;
  border-radius: var(--radius);
  padding: 10px;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 170px;
}
.qr {
  width: 100%;
}
.qr :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}
.qr-ph {
  color: #64758a;
  font-size: var(--text-sm);
  text-align: center;
  padding: 12px;
}
.qr-ph.warn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #b8791a;
}
.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.hint {
  margin-top: 7px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.55;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.preview {
  margin-top: 18px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}
.preview summary {
  cursor: pointer;
  padding: 10px 12px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  user-select: none;
}
.preview pre {
  margin: 0;
  padding: 0 12px 12px;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  white-space: pre-wrap;
  max-height: 180px;
  overflow: auto;
}
</style>
