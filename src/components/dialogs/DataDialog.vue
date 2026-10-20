<script setup lang="ts">
/**
 * 数据弹窗：导出 / 导入 / 资料库的快捷面板（完整设置见设置页）。
 */
import { computed, onMounted, ref } from 'vue'
import Modal from '../Modal.vue'
import Icon from '../Icon.vue'
import { useActions } from '@/composables/useActions'
import { useDataStore } from '@/stores/data'
import { useI18n } from '@/composables/useI18n'
import { humanTime } from '@/core/utils'
import type { LibraryStatus } from '@/types'

const emit = defineEmits(['close'])
const { t, dateLocale } = useI18n()
const actions = useActions()
const data = useDataStore()

const tab = ref<'export' | 'import' | 'library'>('export')
const pasteText = ref<string>('')
const status = ref<LibraryStatus | null>(null)
const busy = ref<boolean>(false)

const lastChange = computed<string>(() =>
  data.meta.updatedAt ? humanTime(data.meta.updatedAt, dateLocale.value) : t('settings.libraryNever')
)

async function loadStatus(): Promise<void> {
  status.value = await actions.libraryStatus()
}

onMounted(loadStatus)

async function pickDir(): Promise<void> {
  busy.value = true
  await actions.chooseLibraryDir()
  busy.value = false
  await loadStatus()
}

async function doWrite(): Promise<void> {
  busy.value = true
  await actions.writeLibrary()
  busy.value = false
  await loadStatus()
}

async function doRescan(): Promise<void> {
  busy.value = true
  await actions.rescanLibrary()
  busy.value = false
  await loadStatus()
}

async function doImportPaste(): Promise<void> {
  if (!pasteText.value.trim()) return
  await actions.importText(pasteText.value)
  pasteText.value = ''
}
</script>

<template>
  <Modal :open="true" :title="t('list.importExport')" :width="600" @close="emit('close')">
    <div class="tabs" role="tablist">
      <button class="tab" :class="{ on: tab === 'export' }" type="button" @click="tab = 'export'">
        <Icon name="download" :size="14" />{{ t('settings.export') }}
      </button>
      <button class="tab" :class="{ on: tab === 'import' }" type="button" @click="tab = 'import'">
        <Icon name="upload" :size="14" />{{ t('settings.import') }}
      </button>
      <button class="tab" :class="{ on: tab === 'library' }" type="button" @click="tab = 'library'">
        <Icon name="hard-drive" :size="14" />{{ t('settings.groupLibrary') }}
      </button>
    </div>

    <!-- 导出 -->
    <section v-if="tab === 'export'" class="sec">
      <button class="row-btn" type="button" @click="actions.exportList('text')">
        <Icon name="file-text" :size="17" class="rb-ico" />
        <span class="rb-body">
          <span class="rb-title">{{ t('settings.exportText') }}</span>
          <span class="rb-sub">{{ t('settings.export') }} .txt · url | title</span>
        </span>
        <Icon name="chevron-right" :size="15" class="rb-arrow" />
      </button>
      <button class="row-btn" type="button" @click="actions.exportList('json')">
        <Icon name="hard-drive" :size="17" class="rb-ico" />
        <span class="rb-body">
          <span class="rb-title">{{ t('settings.exportJson') }}</span>
          <span class="rb-sub">{{ t('settings.export') }} .json</span>
        </span>
        <Icon name="chevron-right" :size="15" class="rb-arrow" />
      </button>
      <button class="row-btn" type="button" @click="actions.exportList('html')">
        <Icon name="globe" :size="17" class="rb-ico" />
        <span class="rb-body">
          <span class="rb-title">{{ t('settings.exportHtml') }}</span>
          <span class="rb-sub">{{ t('settings.export') }} .html</span>
        </span>
        <Icon name="chevron-right" :size="15" class="rb-arrow" />
      </button>
    </section>

    <!-- 导入 -->
    <section v-else-if="tab === 'import'" class="sec">
      <p class="hint">{{ t('settings.importHint') }}</p>
      <button class="btn btn-primary wide" type="button" @click="actions.pickAndImport()">
        <Icon name="upload" :size="15" />{{ t('settings.importPick') }}
      </button>
      <div class="or"><span>{{ t('settings.importPaste') }}</span></div>
      <textarea
        v-model="pasteText"
        class="input textarea"
        rows="6"
        :placeholder="t('settings.importPastePlaceholder')"
      />
      <button class="btn wide" type="button" :disabled="!pasteText.trim()" @click="doImportPaste">
        {{ t('settings.importDo') }}
      </button>
    </section>

    <!-- 资料库 -->
    <section v-else class="sec">
      <div class="card-box">
        <div class="line">
          <Icon :name="status?.connected ? 'check-circle' : 'alert-circle'" :size="16" :class="status?.connected ? 'ok' : 'warn'" />
          <span class="grow">{{ t('settings.libraryDir') }}：{{ status?.dirName || t('settings.libraryUnset') }}</span>
          <button class="btn btn-sm" type="button" :disabled="busy" @click="pickDir">
            {{ t('settings.libraryPick') }}
          </button>
        </div>
      </div>

      <div class="btns">
        <button class="btn btn-primary" type="button" :disabled="busy || !status?.connected" @click="doWrite">
          <Icon name="hard-drive" :size="14" />{{ t('settings.libraryWrite') }}
        </button>
        <button class="btn" type="button" :disabled="busy || !status?.connected" @click="doRescan">
          <Icon name="refresh-cw" :size="14" />{{ t('settings.libraryRescan') }}
        </button>
      </div>

      <p class="hint">{{ t('settings.libraryPickHint') }}</p>
      <p class="hint">{{ t('settings.libraryLast', { time: lastChange }) }}</p>
    </section>

    <template #footer>
      <span class="spacer" />
      <button class="btn" type="button" @click="emit('close')">{{ t('common.close') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  margin-bottom: 16px;
}
.tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}
.tab:hover {
  color: var(--text);
}
.tab.on {
  background: var(--surface-3);
  color: var(--text);
}
.sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--transition), background var(--transition);
}
.row-btn:hover {
  border-color: var(--primary);
  background: var(--surface-2);
}
.rb-ico {
  color: var(--primary);
}
.rb-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rb-title {
  font-size: var(--text-base);
  font-weight: 500;
}
.rb-sub {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.rb-arrow {
  color: var(--text-dim);
}
.hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.6;
}
.wide {
  width: 100%;
}
.or {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-dim);
  font-size: var(--text-xs);
  margin: 4px 0;
}
.or::before,
.or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-soft);
}
.card-box {
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.line {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: var(--text-base);
}
.line.sub {
  font-size: var(--text-sm);
  color: var(--text-muted);
  padding-left: 25px;
}
.grow {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ok {
  color: var(--success);
}
.warn {
  color: var(--warning);
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
</style>
