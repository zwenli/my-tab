/**
 * 核心逻辑自检（纯 Node，无浏览器依赖）。
 * 覆盖：数据模型、变更操作、**资料库文件格式**、检索、导出导入、分享载荷。
 *
 * 用法：npm run selftest
 */
import assert from 'node:assert/strict'
import { LIBRARY_FORMAT } from '../src/core/constants'
import { filesToState, groupFileName, isConflictCopy, shortId, stateToFiles } from '../src/core/libraryFormat'
import { computeStats, createGroup, emptyState, normalizeState } from '../src/core/model'
import * as M from '../src/core/mutations'
import { searchItems } from '../src/core/search'
import { exportToHtml, exportToText, parseText } from '../src/core/exportImport'
import { buildPayload, linksText, packPayload, renderShareText, renderStandaloneHtml, unpackPayload } from '../src/core/share'
import type { CollectableTab, MyTabState, TaskFlag } from '../src/types'

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`)
  }
}

const tab = (url: string, title: string): CollectableTab => ({ url, title, favIconUrl: '' })

/** 深拷贝一份状态，用于模拟「另一台设备」 */
const clone = (s: MyTabState): MyTabState => JSON.parse(JSON.stringify(s)) as MyTabState

const run = async (): Promise<void> => {
  console.log('\n[1] 数据模型')

  await test('emptyState 具备完整结构', () => {
    const s = emptyState('dev-1')
    assert.equal(s.schemaVersion, 1)
    assert.equal(s.meta.deviceId, 'dev-1')
    assert.deepEqual(s.groups, [])
    assert.equal(typeof s.settings.collectPinnedTabs, 'boolean')
    assert.deepEqual(s.quickList, [])
  })

  await test('normalizeState 容错并补齐字段', () => {
    const s = normalizeState({ groups: [{ title: 'x', items: [{ url: 'https://a.com' }] }] }, 'dev-x')
    assert.equal(s.groups.length, 1)
    assert.ok(s.groups[0]!.id)
    assert.equal(s.groups[0]!.items[0]!.title, 'https://a.com')
    assert.equal(s.groups[0]!.items[0]!.starred, false)
    assert.equal(s.meta.deviceId, 'dev-x')
  })

  await test('normalizeState 丢弃坏数据', () => {
    const s = normalizeState({ groups: [null, 42, { items: [null, { url: 'https://b.com' }] }] })
    assert.equal(s.groups.length, 1)
    assert.equal(s.groups[0]!.items.length, 1)
  })

  await test('normalizeSettings 非法枚举回落到默认值', () => {
    const s = normalizeState({ settings: { theme: 'neon', duplicatePolicy: 3, restoreTarget: 'nowhere' } })
    assert.equal(s.settings.theme, 'dark')
    assert.equal(s.settings.duplicatePolicy, 'keep')
    assert.equal(s.settings.restoreTarget, 'current')
  })

  console.log('\n[2] 收集与变更')

  await test('collectTabs 过滤非 http 链接并建组', () => {
    const s = emptyState('d')
    const res = M.collectTabs(s, [tab('https://a.com', 'A'), tab('chrome://newtab', 'N'), tab('https://b.com', 'B')], { title: 'G1' })
    assert.equal(res.group?.items.length, 2)
    assert.equal(res.skipped, 1)
    assert.equal(s.groups[0]!.title, 'G1')
  })

  await test('collectTabs 支持指定文件夹', () => {
    const s = emptyState('d')
    const { folder } = M.addFolder(s, 'Work')
    const res = M.collectTabs(s, [tab('https://a.com', 'A')], { folderId: folder.id })
    assert.equal(res.group?.folderId, folder.id)
  })

  await test('duplicatePolicy=skip 跳过已保存网址', () => {
    const s = emptyState('d')
    s.settings.duplicatePolicy = 'skip'
    M.collectTabs(s, [tab('https://a.com', 'A')], {})
    const res = M.collectTabs(s, [tab('https://a.com', 'A2'), tab('https://c.com', 'C')], {})
    assert.equal(res.group?.items.length, 1)
    assert.equal(res.group?.items[0]!.url, 'https://c.com')
    assert.equal(res.skipped, 1)
  })

  await test('mergeGroups 合并条目并删除源组', () => {
    const s = emptyState('d')
    const a = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const b = M.collectTabs(s, [tab('https://b.com', 'B')], {}).group!
    M.mergeGroups(s, a.id, b.id)
    assert.equal(s.groups.length, 1)
    assert.equal(s.groups[0]!.items.length, 2)
    assert.equal(s.groups[0]!.id, b.id, '合并后只保留目标组')
  })

  await test('moveItemsToGroup 跨组迁移', () => {
    const s = emptyState('d')
    const a = M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], {}).group!
    const b = M.collectTabs(s, [tab('https://c.com', 'C')], {}).group!
    M.moveItemsToGroup(s, [a.items[0]!.id], b.id, -1)
    assert.equal(s.groups.find((g) => g.id === a.id)!.items.length, 1)
    assert.equal(s.groups.find((g) => g.id === b.id)!.items.length, 2)
  })

  await test('locked 组不可删除、仍可改名', () => {
    const s = emptyState('d')
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    M.toggleGroupLock(s, g.id)
    M.removeGroup(s, g.id)
    assert.equal(s.groups.length, 1, '锁定组应被保留')
    M.updateGroup(s, g.id, { title: 'NEW' })
    assert.equal(s.groups[0]!.title, 'NEW', '锁定组仍可改名')
  })

  await test('removeItems 从组内移除条目', () => {
    const s = emptyState('d')
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const id = g.items[0]!.id
    M.removeItems(s, [id])
    assert.equal(s.groups[0]!.items.length, 0)
  })

  await test('待办标记：创建 → 完成 → 取消完成 → 清除', () => {
    const s = emptyState('d')
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const id = g.items[0]!.id
    // 用取值函数读取，避免 assert 的收窄断言影响后续断言
    const task = (): TaskFlag | null => g.items[0]!.task

    // 没有待办时 toggle 保持无任务（由 store 层负责「创建」）
    M.toggleItemTask(s, id)
    assert.equal(task(), null)

    M.setItemTask(s, id, { done: false, completedAt: null })
    assert.equal(task()?.done, false)

    M.toggleItemTask(s, id)
    assert.equal(task()?.done, true)
    assert.ok(task()?.completedAt)

    M.toggleItemTask(s, id)
    assert.equal(task()?.done, false)

    M.setItemTask(s, id, null)
    assert.equal(task(), null)
  })

  await test('快捷列表去重', () => {
    const s = emptyState('d')
    M.addToQuickList(s, [tab('https://a.com', 'A')])
    M.addToQuickList(s, [tab('https://a.com', 'A')])
    assert.equal(s.quickList.length, 1)
  })

  await test('copyItemsToQuickList 复制为独立条目', () => {
    const s = emptyState('d')
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    M.copyItemsToQuickList(s, [g.items[0]!.id])
    assert.equal(s.quickList.length, 1)
    assert.notEqual(s.quickList[0]!.id, g.items[0]!.id, '应使用新 id，避免与列表条目互相影响')
    assert.equal(s.quickList[0]!.url, 'https://a.com')
  })

  await test('文件夹删除后组回到未归类', () => {
    const s = emptyState('d')
    const { folder } = M.addFolder(s, 'Work')
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], { folderId: folder.id }).group!
    assert.equal(g.folderId, folder.id)
    M.removeFolder(s, folder.id, { keepGroups: true })
    assert.equal(s.groups[0]!.folderId, null)
    assert.equal(s.folders.length, 0)
  })

  await test('clearGroups 保留锁定组', () => {
    const s = emptyState('d')
    const g1 = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    M.collectTabs(s, [tab('https://b.com', 'B')], {})
    M.toggleGroupLock(s, g1.id)
    M.clearGroups(s)
    assert.equal(s.groups.length, 1)
    assert.equal(s.groups[0]!.id, g1.id)
  })

  await test('tidy 清理空组但保留锁定组', () => {
    const s = emptyState('d')
    const g1 = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const g2 = M.collectTabs(s, [tab('https://b.com', 'B')], {}).group!
    M.removeItems(s, [g1.items[0]!.id, g2.items[0]!.id])
    M.toggleGroupLock(s, g1.id)
    M.tidy(s, { removeEmptyGroups: true })
    assert.equal(s.groups.length, 1, '空组被清掉，锁定的空组保留')
    assert.equal(s.groups[0]!.id, g1.id)
  })

  await test('computeStats 统计正确', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com/1', 'A1'), tab('https://a.com/2', 'A2'), tab('https://b.com', 'B')], {})
    const st = computeStats(s)
    assert.equal(st.groupCount, 1)
    assert.equal(st.tabCount, 3)
    assert.equal(st.domainCount, 2)
  })

  console.log('\n[3] 资料库文件格式（文件即数据）')

  await test('stateToFiles → filesToState 往返一致', () => {
    const s = emptyState('devA')
    M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], { title: '我的组' })
    M.addFolder(s, 'Work')
    M.addToQuickList(s, [tab('https://q.com', 'Q')])

    const files = stateToFiles(s, { format: LIBRARY_FORMAT })
    assert.ok(files['library.json'], '应产出 library.json')
    assert.ok(files['folders.json'], '应产出 folders.json')
    assert.ok(files['quicklist.json'], '应产出 quicklist.json')
    assert.equal(Object.keys(files).filter((p) => p.startsWith('groups/')).length, 1, '一个组一个文件')

    const back = filesToState(files, { deviceId: 'devA', settings: s.settings })
    assert.equal(back.groups.length, 1)
    assert.equal(back.groups[0]!.title, '我的组')
    assert.equal(back.groups[0]!.items.length, 2)
    assert.equal(back.groups[0]!.items[0]!.url, 'https://a.com')
    assert.equal(back.folders.length, 1)
    assert.equal(back.quickList.length, 1)
    assert.equal(back.groups[0]!.id, s.groups[0]!.id, '组 id 应原样保留')
  })

  await test('文件是排过版的、写给人看的 JSON', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'A')], { title: 'T' })
    const files = stateToFiles(s, { format: LIBRARY_FORMAT })
    const groupPath = Object.keys(files).find((p) => p.startsWith('groups/'))!
    const text = files[groupPath]!

    assert.ok(text.endsWith('\n'), '结尾应有换行')
    const keys = Object.keys(JSON.parse(text) as Record<string, unknown>)
    assert.deepEqual(keys, [...keys].sort(), '键应按字母排序')
    assert.ok(/"createdAt": "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/.test(text), '时间应为 ISO 8601')
    assert.ok(!text.includes('"starred"'), '默认（false）字段应被省略')
    assert.ok(!text.includes('"locked"'), '默认（false）字段应被省略')
  })

  await test('手写 / 改名 / 挪位置的文件都能读进来', () => {
    const files: Record<string, string> = {
      'library.json': JSON.stringify({ format: 'my-tab', schemaVersion: 1, groupOrder: [] }),
      'groups/随便起的名字.json': JSON.stringify({
        id: 'g1',
        title: '手写的组',
        items: [{ url: 'https://hand.com', title: '手写' }]
      })
    }
    const state = filesToState(files, { deviceId: 'd', settings: emptyState().settings })
    assert.equal(state.groups.length, 1)
    assert.equal(state.groups[0]!.id, 'g1', 'id 来自文件内容，而非文件名')
    assert.equal(state.groups[0]!.items.length, 1)
    assert.ok(state.groups[0]!.items[0]!.id, '缺失的条目 id 应被自动补上')
  })

  await test('groupOrder 决定组顺序，未登记的追加到末尾', () => {
    const mk = (id: string, title: string): string =>
      JSON.stringify({ id, title, items: [{ url: `https://${id}.com`, title: id }] })
    const files: Record<string, string> = {
      'library.json': JSON.stringify({ format: 'my-tab', schemaVersion: 1, groupOrder: ['b', 'a'] }),
      'groups/a.json': mk('a', 'A'),
      'groups/b.json': mk('b', 'B'),
      'groups/c.json': mk('c', 'C')
    }
    const state = filesToState(files, { deviceId: 'd', settings: emptyState().settings })
    assert.deepEqual(
      state.groups.map((g) => g.id),
      ['b', 'a', 'c']
    )
  })

  await test('识别云盘冲突副本，不做静默合并', () => {
    assert.ok(isConflictCopy('my-tab (冲突副本 2026-10-16).json'))
    assert.ok(isConflictCopy('A [a1b2c3d4]-DESKTOP-conflicted copy.json'))
    assert.ok(!isConflictCopy('A [a1b2c3d4].json'))
  })

  await test('组文件名 = 标题 + 短 id，并做文件系统安全清洗', () => {
    const g = createGroup({ title: 'a/b:c*?"<>|', items: [] })
    const name = groupFileName(g)
    assert.ok(name.startsWith('groups/'))
    assert.ok(!/[\\/:*?"<>|]/.test(name.slice('groups/'.length)), '文件名不应含非法字符')
    assert.ok(name.includes(` [${shortId(g.id)}].json`), '文件名应带稳定短 id')
  })

  console.log('\n[4] 检索')

  await test('标题命中 + 域名命中', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://github.com/vuejs', 'Vue.js 官方仓库'), tab('https://mdn.io', 'Web 文档')], {})
    assert.equal(searchItems(s, 'vue').length, 1)
    assert.equal(searchItems(s, 'github').length, 1)
    assert.equal(searchItems(s, '不存在的词').length, 0)
  })

  await test('多词元 AND 语义', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'Vue 教程'), tab('https://b.com', 'React 教程')], {})
    assert.equal(searchItems(s, 'vue 教程').length, 1)
    assert.equal(searchItems(s, 'vue react').length, 0)
  })

  await test('searchInUrl 开关生效', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://special-domain.com', '无关标题')], {})
    assert.equal(searchItems(s, 'special', { searchInUrl: true }).length, 1)
    assert.equal(searchItems(s, 'special', { searchInUrl: false }).length, 0)
  })

  console.log('\n[5] 导出 / 导入')

  await test('文本导出 → 解析回等价结构', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], { title: '我的组' })
    const text = exportToText(s)
    assert.ok(text.includes('[我的组]'))
    const groups = parseText(text)
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.title, '我的组')
    assert.equal(groups[0]!.items.length, 2)
    assert.equal(groups[0]!.items[0]!.url, 'https://a.com')
  })

  await test('HTML 书签导出含锚点与转义', () => {
    const s = emptyState('d')
    M.collectTabs(s, [tab('https://a.com', 'A & B')], {})
    const html = exportToHtml(s)
    assert.ok(html.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>'))
    assert.ok(html.includes('https://a.com'))
    assert.ok(html.includes('A &amp; B'))
  })

  console.log('\n[6] 分享')

  await test('载荷压缩往返一致', async () => {
    const payload = buildPayload({
      title: '测试组',
      items: Array.from({ length: 40 }, (_, i) => ({ url: `https://site${i}.com/page?q=${i}`, title: `第 ${i} 个标签` }))
    })
    const packed = await packPayload(payload)
    const back = await unpackPayload(packed)
    assert.ok(back)
    assert.equal(back.title, '测试组')
    assert.equal(back.items.length, 40)
    assert.equal(back.items[3]!.url, payload.items[3]!.url)
  })

  await test('独立分享页包含全部链接且自包含', () => {
    const payload = buildPayload({ title: 'T', items: [{ url: 'https://a.com/?x=1&y=2', title: '<b>A</b>', starred: false }] })
    const html = renderStandaloneHtml(payload)
    assert.ok(html.startsWith('<!DOCTYPE html>'))
    assert.ok(html.includes('https://a.com/?x=1&amp;y=2'), 'URL 应被 HTML 转义')
    assert.ok(html.includes('&lt;b&gt;A&lt;/b&gt;'), '标题应被转义，防注入')
    assert.ok(!/<script src=/.test(html), '不应引用外部脚本')
  })

  await test('纯文本分享与链接清单', () => {
    const payload = buildPayload({
      title: 'T',
      items: [
        { url: 'https://a.com', title: 'A', starred: false },
        { url: 'https://b.com', title: 'B', starred: false }
      ]
    })
    assert.equal(renderShareText(payload).split('\n').length, 4)
    assert.equal(linksText(payload.items), 'https://a.com\nhttps://b.com')
  })

  console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`)
  process.exitCode = failed ? 1 : 0
}

void run()
