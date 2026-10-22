import { describe, expect, it } from 'vitest'
import { emptyState } from '@/core/model'
import * as M from '@/core/mutations'
import { searchGroups, searchItems } from '@/core/search'
import type { CollectableTab } from '@/types'

const tab = (url: string, title: string): CollectableTab => ({ url, title, favIconUrl: '' })

describe('检索', () => {
  it('标题命中 + 域名命中', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://github.com/vuejs', 'Vue.js 官方仓库'), tab('https://mdn.io', 'Web 文档')], {})
    expect(searchItems(s, 'vue').length).toBe(1)
    expect(searchItems(s, 'github').length).toBe(1)
    expect(searchItems(s, '不存在的词').length).toBe(0)
  })

  it('多词元 AND 语义', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'Vue 教程'), tab('https://b.com', 'React 教程')], {})
    expect(searchItems(s, 'vue 教程').length).toBe(1)
    expect(searchItems(s, 'vue react').length).toBe(0)
  })

  it('searchInUrl 开关生效', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://special-domain.com', '无关标题')], {})
    expect(searchItems(s, 'special', { searchInUrl: true }).length).toBe(1)
    expect(searchItems(s, 'special', { searchInUrl: false }).length).toBe(0)
  })

  it('组名可检索（标题 / 备注），空词不出结果', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', '第一个')], { title: '前端周报' })
    const second = M.collectTabs(s, [tab('https://b.com', '第二个')], { title: '设计素材' })
    M.updateGroup(s, second.group!.id, { note: '配色与字体' })

    expect(searchGroups(s, '前端').length).toBe(1)
    expect(searchGroups(s, '周报').length).toBe(1)
    expect(searchGroups(s, '配色').length, '备注也要能命中').toBe(1)
    expect(searchGroups(s, '不存在的词').length).toBe(0)
    expect(searchGroups(s, '').length, '空查询不应返回全部分组').toBe(0)
  })

  it('组内条目命中不算分组命中（避免两块结果重复）', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://vuejs.org', 'Vue 文档')], { title: '资料汇总' })
    expect(searchGroups(s, 'vue').length).toBe(0)
  })

  it('默认组名（时间戳到秒）也能搜到，修复「最近收起」跳转空白', () => {
    const s = emptyState('d')
    const title = '2026-10-22 14:30:07'
    M.collectTabs(s, [tab('https://a.com', '随便一个标题')], { title })
    expect(searchGroups(s, title).length).toBe(1)
    expect(searchGroups(s, '14:30').length).toBe(1)
    // 同一串拿去按标签检索依旧是 0 条，这正是把入口从 #q 改成 #g 的原因
    expect(searchItems(s, title).length).toBe(0)
  })
})
