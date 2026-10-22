import { describe, expect, it } from 'vitest'
import { exportToHtml, exportToText, parseText } from '@/core/exportImport'
import { emptyState } from '@/core/model'
import * as M from '@/core/mutations'
import type { CollectableTab } from '@/types'

const tab = (url: string, title: string): CollectableTab => ({ url, title, favIconUrl: '' })

describe('导出 / 导入', () => {
  it('文本导出 → 解析回等价结构', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], { title: '我的组' })
    const text = exportToText(s)
    expect(text).toContain('[我的组]')
    const groups = parseText(text)
    expect(groups.length).toBe(1)
    expect(groups[0]!.title).toBe('我的组')
    expect(groups[0]!.items.length).toBe(2)
    expect(groups[0]!.items[0]!.url).toBe('https://a.com')
  })

  it('HTML 书签导出含锚点与转义', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'A & B')], {})
    const html = exportToHtml(s)
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
    expect(html).toContain('https://a.com')
    expect(html).toContain('A &amp; B')
  })
})
