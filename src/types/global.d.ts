/**
 * 环境补丁声明。
 *
 * 只补 TypeScript 标准库尚未覆盖、但目标浏览器（Chrome 110+）已经实现的 API。
 * 使用 `var` 而非 `interface Window`，是因为同一份代码也会跑在 Service Worker 里，
 * 那里只有 `globalThis` 而没有 `window`。
 */

export interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | (string & {})
  suggestedName?: string
}

declare global {
  /** File System Access API 的目录选择入口（尚未进入 lib.dom.d.ts） */
  // eslint-disable-next-line no-var
  var showDirectoryPicker: ((options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>) | undefined
}

/** Vue SFC 模块声明（vue-tsc 已内置，这里兜底给纯 tsc 场景） */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
