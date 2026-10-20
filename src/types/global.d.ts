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

/* 注：`*.vue` 的兜底声明放在 shims-vue.d.ts。
 * 本文件是模块（有顶层 export），这里的 `declare module '*.vue'` 会退化成模块增强，
 * 通配符不生效，纯 tsc 场景仍然报 TS2307。 */
