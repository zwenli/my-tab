<script setup lang="ts">
/**
 * 资料库访问提示条（列表页顶部）。
 *
 * 只在「绑定还在、但浏览器把授权重置了」或「授权被拒」时出现 ——
 * 这时**不是**没连接资料库，数据也没丢，只差一次确认。
 */
import Icon from './Icon.vue'
import { useActions } from '@/composables/useActions'
import { useDataStore } from '@/stores/data'
import { useI18n } from '@/composables/useI18n'
import { useLibraryAccess } from '@/composables/useLibraryAccess'

const data = useDataStore()
const { t } = useI18n()
const actions = useActions()
const { needsConfirm, denied, restoring, restore } = useLibraryAccess()

function onAct(): void {
  if (denied.value) {
    void actions.chooseLibraryDir()
    return
  }
  void restore()
}
</script>

<template>
  <div v-if="needsConfirm || denied" class="lib-bar" :class="denied ? 'bad' : 'warn'" role="status">
    <Icon :name="denied ? 'x-circle' : 'shield'" :size="16" class="lb-ico" />
    <div class="lb-text">
      <div class="lb-title">
        {{ t(denied ? 'library.deniedTitle' : 'library.needsGrantTitle', { name: data.library.dirName }) }}
      </div>
      <div class="lb-hint">
        {{ t(denied ? 'library.deniedHint' : 'library.needsGrantHint') }}
      </div>
    </div>
    <button class="btn btn-sm" type="button" :class="{ 'btn-primary': needsConfirm }" :disabled="restoring" @click="onAct">
      <Icon :name="denied ? 'hard-drive' : 'refresh-cw'" :size="13" />
      {{ denied ? t('library.repick') : t('library.restore') }}
    </button>
  </div>
</template>

<style scoped>
.lib-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  animation: fade-in 140ms ease-out;
}
.lib-bar.warn {
  border-color: var(--border-strong);
  background: var(--warning-soft);
}
.lib-bar.bad {
  border-color: var(--border-strong);
  background: var(--danger-soft);
}
.lb-ico {
  flex: 0 0 auto;
  color: var(--warning);
}
.lib-bar.bad .lb-ico {
  color: var(--danger);
}
.lb-text {
  flex: 1;
  min-width: 0;
}
.lb-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lb-hint {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
