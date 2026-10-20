<script setup lang="ts">
/**
 * 移动弹窗：把标签条目移到其他组，或把标签组移到文件夹。
 */
import { computed, ref } from 'vue'
import Modal from '../Modal.vue'
import Icon from '../Icon.vue'
import { useDataStore } from '@/stores/data'
import { useI18n } from '@/composables/useI18n'

const props = defineProps({
  /** 'items' → 选择目标组；'groups' → 选择目标文件夹 */
  kind: { type: String, default: 'items' },
  itemIds: { type: Array, default: () => [] },
  groupIds: { type: Array, default: () => [] },
  excludeGroupId: { type: String, default: '' },
  onConfirm: { type: Function, default: null }
})

const emit = defineEmits(['close'])
const data = useDataStore()
const { t } = useI18n()

const query = ref('')
const picked = ref(props.kind === 'groups' ? '' : '')

const groupOptions = computed(() => {
  const q = query.value.trim().toLowerCase()
  return data.groups
    .filter((g) => g.id !== props.excludeGroupId)
    .filter((g) => (q ? `${g.title} ${g.items.map((i) => i.title).join(' ')}`.toLowerCase().includes(q) : true))
})

const folderOptions = computed(() => data.folders)

function confirm() {
  props.onConfirm?.(picked.value || null)
  emit('close')
}
</script>

<template>
  <Modal
    :open="true"
    :title="t('dialog.moveTo')"
    :subtitle="kind === 'groups' ? t('dialog.pickFolder') : t('dialog.pickGroup')"
    :width="520"
    @close="emit('close')"
  >
    <input
      v-if="kind === 'items'"
      v-model="query"
      class="input search"
      type="text"
      :placeholder="t('common.search')"
      data-autofocus
    />

    <ul class="list">
      <li v-if="kind === 'groups'">
        <button class="opt" :class="{ on: picked === '' }" type="button" @click="picked = ''">
          <span class="opt-ico"><Icon name="layers" :size="15" /></span>
          <span class="opt-name">{{ t('dialog.unsorted') }}</span>
          <Icon v-if="picked === ''" name="check" :size="15" class="tick" />
        </button>
      </li>

      <template v-if="kind === 'items'">
        <li v-for="g in groupOptions" :key="g.id">
          <button class="opt" :class="{ on: picked === g.id }" type="button" @click="picked = g.id">
            <span class="opt-ico"><Icon name="layers" :size="15" /></span>
            <span class="opt-name truncate">{{ g.title || t('group.untitled') }}</span>
            <span class="opt-meta">{{ g.items.length }}</span>
            <Icon v-if="picked === g.id" name="check" :size="15" class="tick" />
          </button>
        </li>
        <li v-if="!groupOptions.length" class="empty">{{ t('common.empty') }}</li>
      </template>

      <template v-else>
        <li v-for="f in folderOptions" :key="f.id">
          <button class="opt" :class="{ on: picked === f.id }" type="button" @click="picked = f.id">
            <span class="opt-ico"><Icon name="folder" :size="15" /></span>
            <span class="opt-name truncate">{{ f.name || t('dialog.newFolder') }}</span>
            <span class="opt-meta">{{ data.groups.filter((g) => g.folderId === f.id).length }}</span>
            <Icon v-if="picked === f.id" name="check" :size="15" class="tick" />
          </button>
        </li>
        <li v-if="!folderOptions.length" class="empty">{{ t('dialog.noFolders') }}</li>
      </template>
    </ul>

    <template #footer>
      <span class="spacer" />
      <button class="btn" type="button" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button class="btn btn-primary" type="button" :disabled="kind === 'items' && !picked" @click="confirm">
        {{ t('common.confirm') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.search {
  margin-bottom: 10px;
}
.list {
  max-height: 46vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  padding: 5px;
  background: var(--bg-elevated);
}
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-base);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition);
}
.opt:hover {
  background: var(--surface-2);
  color: var(--text);
}
.opt.on {
  background: var(--primary-soft);
  color: var(--text);
}
.opt-ico {
  color: var(--text-muted);
  display: inline-flex;
}
.opt-name {
  flex: 1;
  min-width: 0;
}
.opt-meta {
  font-size: var(--text-xs);
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.tick {
  color: var(--primary);
}
.empty {
  padding: 18px;
  text-align: center;
  color: var(--text-dim);
  font-size: var(--text-sm);
}
</style>
