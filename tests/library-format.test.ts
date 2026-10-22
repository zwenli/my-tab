import { describe, expect, it } from 'vitest'
import { LIBRARY_FORMAT } from '@/core/constants'
import { filesToState, groupFileName, isConflictCopy, shortId, stateToFiles } from '@/core/libraryFormat'
import { countOpenTasks, createGroup, emptyState } from '@/core/model'
import * as M from '@/core/mutations'
import type { CollectableTab } from '@/types'

const tab = (url: string, title: string): CollectableTab => ({ url, title, favIconUrl: '' })
const groupFile = (files: Record<string, string>): string => Object.keys(files).find((p) => p.startsWith('groups/'))!

describe('资料库文件格式（文件即数据）', () => {
  it('stateToFiles → filesToState 往返一致', () => {
    const s = emptyState('devA')
    M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], { title: '我的组' })
    M.addFolder(s, 'Work')
    M.addToQuickList(s, [tab('https://q.com', 'Q')])

    const files = stateToFiles(s, { format: LIBRARY_FORMAT })
    expect(files['library.json'], '应产出 library.json').toBeTruthy()
    expect(files['folders.json'], '应产出 folders.json').toBeTruthy()
    expect(files['quicklist.json'], '应产出 quicklist.json').toBeTruthy()
    expect(Object.keys(files).filter((p) => p.startsWith('groups/')).length, '一个组一个文件').toBe(1)

    const back = filesToState(files, { deviceId: 'devA', settings: s.settings })
    expect(back.groups.length).toBe(1)
    expect(back.groups[0]!.title).toBe('我的组')
    expect(back.groups[0]!.items.length).toBe(2)
    expect(back.groups[0]!.items[0]!.url).toBe('https://a.com')
    expect(back.folders.length).toBe(1)
    expect(back.quickList.length).toBe(1)
    expect(back.groups[0]!.id, '组 id 应原样保留').toBe(s.groups[0]!.id)
  })

  it('待办标记往返：未完成 / 已完成都要落盘（刷新后不丢）', () => {
    const s = emptyState('d')
    const g = M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], { title: 'T' }).group!
    // 「加为待办」创建的正是 done:false —— 它也必须能被写进文件
    M.setItemTask(s, g.items[0]!.id, { done: false, completedAt: null })
    M.setItemTask(s, g.items[1]!.id, { done: true, completedAt: 1700000000000 })

    const files = stateToFiles(s, { format: LIBRARY_FORMAT })
    const text = files[groupFile(files)]!
    expect(text, '待办标记必须出现在组文件里').toContain('"task"')

    const back = filesToState(files, { deviceId: 'd', settings: s.settings })
    const items = back.groups[0]!.items
    expect(items[0]!.task, '未完成待办不应丢失').toEqual({ done: false, completedAt: null })
    expect(items[1]!.task?.done, '已完成待办应保留').toBe(true)
    expect(items[1]!.task?.completedAt, '完成时间应保留').toBe(1700000000000)
    expect(countOpenTasks(back), '重读后未完成计数应为 1').toBe(1)
  })

  it('文件是排过版的、写给人看的 JSON', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'A')], { title: 'T' })
    const files = stateToFiles(s, { format: LIBRARY_FORMAT })
    const text = files[groupFile(files)]!

    expect(text.endsWith('\n'), '结尾应有换行').toBe(true)
    const keys = Object.keys(JSON.parse(text) as Record<string, unknown>)
    expect(keys, '键应按字母排序').toEqual([...keys].sort())
    expect(text, '时间应为 ISO 8601').toMatch(/"createdAt": "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/)
    expect(text, '默认（false）字段应被省略').not.toContain('"starred"')
    expect(text, '默认（false）字段应被省略').not.toContain('"locked"')
  })

  it('手写 / 改名 / 挪位置的文件都能读进来', () => {
    const files: Record<string, string> = {
      'library.json': JSON.stringify({ format: 'my-tab', schemaVersion: 1, groupOrder: [] }),
      'groups/随便起的名字.json': JSON.stringify({
        id: 'g1',
        title: '手写的组',
        items: [{ url: 'https://hand.com', title: '手写' }]
      })
    }
    const state = filesToState(files, { deviceId: 'd', settings: emptyState().settings })
    expect(state.groups.length).toBe(1)
    expect(state.groups[0]!.id, 'id 来自文件内容，而非文件名').toBe('g1')
    expect(state.groups[0]!.items.length).toBe(1)
    expect(state.groups[0]!.items[0]!.id, '缺失的条目 id 应被自动补上').toBeTruthy()
  })

  it('groupOrder 决定组顺序，未登记的追加到末尾', () => {
    const mk = (id: string, title: string): string =>
      JSON.stringify({ id, title, items: [{ url: `https://${id}.com`, title: id }] })
    const files: Record<string, string> = {
      'library.json': JSON.stringify({ format: 'my-tab', schemaVersion: 1, groupOrder: ['b', 'a'] }),
      'groups/a.json': mk('a', 'A'),
      'groups/b.json': mk('b', 'B'),
      'groups/c.json': mk('c', 'C')
    }
    const state = filesToState(files, { deviceId: 'd', settings: emptyState().settings })
    expect(state.groups.map((g) => g.id)).toEqual(['b', 'a', 'c'])
  })

  it('识别云盘冲突副本，不做静默合并', () => {
    expect(isConflictCopy('my-tab (冲突副本 2026-10-16).json')).toBe(true)
    expect(isConflictCopy('A [a1b2c3d4]-DESKTOP-conflicted copy.json')).toBe(true)
    expect(isConflictCopy('A [a1b2c3d4].json')).toBe(false)
  })

  it('组文件名 = 标题 + 短 id，并做文件系统安全清洗', () => {
    const g = createGroup({ title: 'a/b:c*?"<>|', items: [] })
    const name = groupFileName(g)
    expect(name.startsWith('groups/')).toBe(true)
    expect(name.slice('groups/'.length), '文件名不应含非法字符').not.toMatch(/[\\/:*?"<>|]/)
    expect(name, '文件名应带稳定短 id').toContain(` [${shortId(g.id)}].json`)
  })
})
