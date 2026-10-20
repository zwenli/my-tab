<script setup lang="ts">
/**
 * 弹窗宿主：根据 ui.dialogs 栈顶渲染对应弹窗组件。
 * 页面只需调用 `ui.openDialog('confirm', {...})`，无需再管渲染。
 */
import ConfirmDialog from './ConfirmDialog.vue'
import PromptDialog from './PromptDialog.vue'
import MoveDialog from './MoveDialog.vue'
import ShareDialog from './ShareDialog.vue'
import DataDialog from './DataDialog.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const MAP = {
  confirm: ConfirmDialog,
  prompt: PromptDialog,
  move: MoveDialog,
  share: ShareDialog,
  data: DataDialog
}
</script>

<template>
  <component
    :is="MAP[d.name]"
    v-for="d in ui.dialogs"
    :key="d.key"
    v-bind="d.props"
    @close="ui.closeDialog(d.key)"
  />
</template>
