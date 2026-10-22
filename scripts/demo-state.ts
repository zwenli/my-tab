/**
 * 演示数据构造（仅用于本地视觉验收与截图，不参与扩展运行）。
 */
import { createFolder, createGroup, createTabItem, emptyState } from '../src/core/model'
import { DEFAULT_SETTINGS } from '../src/core/constants'
import type { MyTabState, TabItem } from '../src/types'

export interface DemoOptions {
  theme?: 'dark' | 'light'
  language?: 'zh-CN' | 'en-US'
}

type Extra = Partial<Pick<TabItem, 'starred' | 'task' | 'note'>>

const t = (url: string, title: string, extra: Extra = {}): TabItem => ({ ...createTabItem({ url, title }), ...extra })

export function buildDemoState({ theme = 'dark', language = 'zh-CN' }: DemoOptions = {}): MyTabState {
  const state = emptyState('demo-device-0001')
  state.settings = { ...DEFAULT_SETTINGS, theme, language }

  const work = createFolder({ name: '工作' })
  const read = createFolder({ name: '待读' })
  state.folders.push(work, read)

  state.groups.push(
    createGroup({
      title: 'Vue 3 组合式 API 调研',
      note: '重点看 reactivity 与 provide/inject 的边界；顺手记一下 <script setup> 的编译产物。',
      folderId: work.id,
      starred: true,
      items: [
        t('https://cn.vuejs.org/guide/introduction.html', 'Vue.js 官方文档 - 简介', { starred: true }),
        t('https://cn.vuejs.org/api/composition-api-setup.html', '组合式 API：setup()', {
          task: { done: false, completedAt: null }
        }),
        t('https://github.com/vuejs/core', 'vuejs/core: Vue 3 核心仓库'),
        t('https://pinia.vuejs.org/', 'Pinia 官方文档', { note: '状态管理选型：Pinia 比 Vuex 更贴合组合式 API。' }),
        t('https://router.vuejs.org/', 'Vue Router'),
        t('https://vitejs.dev/guide/build.html', 'Vite 构建指南', { task: { done: true, completedAt: Date.now() - 3600_000 } })
      ]
    })
  )

  state.groups.push(
    createGroup({
      title: 'Chrome 扩展开发（Manifest V3）',
      folderId: work.id,
      locked: true,
      items: [
        t('https://developer.chrome.com/docs/extensions/develop/migrate', '迁移到 Manifest V3'),
        t('https://developer.chrome.com/docs/extensions/reference/api/storage', 'chrome.storage API 参考', { starred: true }),
        t('https://developer.chrome.com/docs/extensions/reference/api/contextMenus', 'chrome.contextMenus API'),
        t('https://developer.chrome.com/docs/extensions/reference/api/omnibox', 'chrome.omnibox API'),
        t('https://developer.chrome.com/docs/extensions/reference/api/tabs', 'chrome.tabs API'),
        t('https://developer.chrome.com/docs/extensions/develop/concepts/service-workers', 'Service Worker 生命周期')
      ]
    })
  )

  state.groups.push(
    createGroup({
      title: '文件系统与同步方案',
      folderId: read.id,
      items: [
        t('https://developer.mozilla.org/zh-CN/docs/Web/API/File_System_API', 'File System Access API'),
        t('https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API', 'IndexedDB API'),
        t('https://developer.mozilla.org/zh-CN/docs/Web/API/Compression_Streams_API', 'Compression Streams API'),
        t('https://developer.mozilla.org/en-US/docs/Web/API/structuredClone', 'structuredClone()')
      ]
    })
  )

  state.groups.push(
    createGroup({
      title: '',
      items: [t('https://www.figma.com/', 'Figma', { starred: true }), t('https://excalidraw.com/', 'Excalidraw')]
    })
  )

  // 模拟一个「用默认组名」的组：时间戳精确到秒，不拼数量
  const d = new Date(Date.now() - 86400_000 * 2)
  const p = (n: number): string => String(n).padStart(2, '0')
  state.groups.push(
    createGroup({
      title: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
      createdAt: Date.now() - 86400_000 * 2,
      items: [
        t('https://news.ycombinator.com/', 'Hacker News'),
        t('https://github.com/trending', 'Trending repositories on GitHub'),
        t('https://stackoverflow.com/questions/tagged/chrome-extension', 'chrome-extension 标签 - Stack Overflow'),
        t('https://caniuse.com/', 'Can I use... Support tables'),
        t('https://web.dev/', 'web.dev'),
        t('https://caniuse.com/compressionstream', 'CompressionStream 兼容性'),
        t('https://chromewebstore.google.com/', 'Chrome 应用商店'),
        t('https://developer.chrome.com/blog', 'Chrome for Developers Blog')
      ]
    })
  )

  state.quickList.push(
    t('https://github.com/', 'GitHub'),
    t('https://mail.google.com/', 'Gmail'),
    t('https://calendar.google.com/', 'Google 日历'),
    t('https://chat.deepseek.com/', 'DeepSeek'),
    t('https://cn.vuejs.org/', 'Vue.js')
  )

  return state
}
