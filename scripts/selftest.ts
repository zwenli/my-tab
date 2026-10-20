/**
 * 核心逻辑自检（纯 Node，无浏览器依赖）。
 * 覆盖：数据模型、变更操作、**资料库文件格式**、检索、导出导入、分享载荷。
 *
 * 用法：npm run selftest
 */
import assert from 'node:assert/strict'
import { LIBRARY_FORMAT } from '../src/core/constants'
import { filesToState, groupFileName, isConflictCopy, shortId, stateToFiles } from '../src/core/libraryFormat'
import { badgeText, computeStats, countOpenTasks, createGroup, createTabItem, emptyState, normalizeState } from '../src/core/model'
import * as M from '../src/core/mutations'
import { searchItems } from '../src/core/search'
import { exportToHtml, exportToText, parseText } from '../src/core/exportImport'
import { buildPayload, linksText, packPayload, renderShareText, renderStandaloneHtml, unpackPayload } from '../src/core/share'
import { applyVisibleOrder, clampPinnedIndex, hitTest, moveToInsertPoint, sameOrder } from '../src/core/dragOrder'
import { resolveTipDir, resolveTipPos } from '../src/directives/tipGeometry'
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

  await test('removeItems 可选清掉变空的组（还原后移除）', () => {
    const s = emptyState('d')
    const g = M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], {}).group!
    M.removeItems(s, [g.items[0]!.id], { pruneEmptyGroups: true })
    assert.equal(s.groups.length, 1, '还没空，组应保留')
    M.removeItems(s, [g.items[0]!.id], { pruneEmptyGroups: true })
    assert.equal(s.groups.length, 0, '空了应移除组')

    const locked = M.collectTabs(s, [tab('https://c.com', 'C')], {}).group!
    M.toggleGroupLock(s, locked.id)
    M.removeItems(s, [locked.items[0]!.id], { pruneEmptyGroups: true })
    assert.equal(s.groups.length, 1, '锁定组不清')
    assert.equal(s.groups[0]!.items.length, 1, '锁定组的条目也不删')
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

  await test('待办计数（工具栏徽标口径）：只算未完成，且不含快捷列表', () => {
    const s = emptyState('d')
    const g = M.collectTabs(
      s,
      [tab('https://a.com', 'A'), tab('https://b.com', 'B'), tab('https://c.com', 'C')],
      {}
    ).group!
    const [a, b, c] = g.items

    assert.equal(countOpenTasks(s), 0, '初始没有待办')

    M.setItemTask(s, a!.id, { done: false, completedAt: null })
    assert.equal(countOpenTasks(s), 1)

    M.setItemTask(s, b!.id, { done: false, completedAt: null })
    M.toggleItemTask(s, b!.id)
    assert.equal(countOpenTasks(s), 1, '已完成的不计入')

    M.setItemTask(s, c!.id, { done: false, completedAt: null })
    assert.equal(countOpenTasks(s), 2)

    M.setItemTask(s, c!.id, null)
    assert.equal(countOpenTasks(s), 1, '取消待办标记后不再计入')

    // 快捷列表是常驻收藏，不进待办进度
    const q = createTabItem({ url: 'https://q.com', title: 'Q' })
    q.task = { done: false, completedAt: null }
    s.quickList.push(q)
    assert.equal(countOpenTasks(s), 1, '快捷列表的待办不计入')

    // 与侧边栏共用的统计口径保持一致
    assert.equal(computeStats(s).taskOpen, 1)
  })

  await test('徽标文本：没有待办不显示，超出收敛为 99+', () => {
    assert.equal(badgeText(0), '', '0 个待办不显示数字')
    assert.equal(badgeText(-1), '')
    assert.equal(badgeText(3), '3')
    assert.equal(badgeText(99), '99')
    assert.equal(badgeText(100), '99+')
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

  console.log('\n[7] 提示气泡定位')

  await test('顶栏按钮（贴着上沿）自动朝下', () => {
    const rect = { left: 500, top: 10, right: 530, bottom: 38, width: 30, height: 28 }
    assert.equal(resolveTipDir(rect, 80, 26, 'auto', 8, { vw: 1200, vh: 800 }), 'bottom')
  })

  await test('页面中部按钮优先朝上', () => {
    const rect = { left: 400, top: 400, right: 430, bottom: 428, width: 30, height: 28 }
    assert.equal(resolveTipDir(rect, 80, 26, 'auto', 8, { vw: 1200, vh: 800 }), 'top')
  })

  await test('底部按钮自动翻到上方', () => {
    const rect = { left: 400, top: 760, right: 430, bottom: 788, width: 30, height: 28 }
    assert.equal(resolveTipDir(rect, 80, 26, 'auto', 8, { vw: 1200, vh: 800 }), 'top')
  })

  await test('显式方向优先于自动检测', () => {
    const rect = { left: 400, top: 400, right: 430, bottom: 428, width: 30, height: 28 }
    assert.equal(resolveTipDir(rect, 80, 26, 'right', 8, { vw: 1200, vh: 800 }), 'right')
  })

  await test('贴右边缘的气泡被夹回视口内', () => {
    const rect = { left: 1160, top: 10, right: 1190, bottom: 38, width: 30, height: 28 }
    const pos = resolveTipPos(rect, 200, 26, 'bottom', 8, { vw: 1200, vh: 800 })
    assert.equal(pos.x, 1200 - 200 - 8, '右侧至少要留 8px')
    assert.equal(pos.y, 38 + 8)
  })

  await test('超宽气泡也不会越界', () => {
    const rect = { left: 600, top: 400, right: 630, bottom: 428, width: 30, height: 28 }
    const pos = resolveTipPos(rect, 1400, 26, 'top', 8, { vw: 400, vh: 800 })
    assert.equal(pos.x, 8)
  })

  await test('朝下时 y 取元素下沿 + 间距', () => {
    const rect = { left: 100, top: 10, right: 130, bottom: 38, width: 30, height: 28 }
    assert.deepEqual(resolveTipPos(rect, 80, 26, 'bottom', 8, { vw: 1200, vh: 800 }), { x: 75, y: 46 })
  })

  console.log('\n[8] 拖拽排序')

  await test('拖到第一位：插到最前，而不是跑到末尾', () => {
    assert.deepEqual(moveToInsertPoint(['a', 'b', 'c', 'd'], 2, 0), ['c', 'a', 'b', 'd'])
    assert.deepEqual(moveToInsertPoint(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c'])
  })

  await test('拖到末尾 / 向下移动时下标左移一位', () => {
    assert.deepEqual(moveToInsertPoint(['a', 'b', 'c', 'd'], 0, 4), ['b', 'c', 'd', 'a'])
    // 插到 c 之前（移动前的下标 2），a 抽走后 c 变成下标 1
    assert.deepEqual(moveToInsertPoint(['a', 'b', 'c', 'd'], 0, 2), ['b', 'a', 'c', 'd'])
    assert.deepEqual(moveToInsertPoint(['a', 'b', 'c', 'd'], 1, 4), ['a', 'c', 'd', 'b'])
  })

  await test('落回原位是空操作（不写盘）', () => {
    const before = ['a', 'b', 'c']
    assert.deepEqual(moveToInsertPoint(before, 1, 1), before)
    assert.deepEqual(moveToInsertPoint(before, 1, 2), before)
    assert.ok(sameOrder(before, moveToInsertPoint(before, 1, 1)))
    assert.ok(!sameOrder(before, moveToInsertPoint(before, 1, 3)))
  })

  await test('筛选视图内重排不影响其他组的位置', () => {
    const all = ['a', 'b', 'c', 'd', 'e']
    const visible = ['b', 'd'] // 只看得到 b、d，把 d 拖到 b 前面
    assert.deepEqual(applyVisibleOrder(all, ['d', 'b']), ['a', 'd', 'c', 'b', 'e'])
    assert.deepEqual(applyVisibleOrder(all, visible), all, '顺序没变时全局也不变')
    assert.deepEqual(applyVisibleOrder(all, ['x', 'b', 'd', 'b']), all, '未知 id、重复 id 被忽略')
  })

  await test('星标置顶时插入点夹在所属分段内', () => {
    // 前 2 个是星标组：[星, 星, 普通, 普通]
    assert.equal(clampPinnedIndex(0, 3, 2), 2, '普通组拖到顶上 → 只能落到星标段之后')

    assert.equal(clampPinnedIndex(4, 0, 2), 2, '星标组拖到底 → 只能落到星标段末尾')
    assert.equal(clampPinnedIndex(1, 0, 2), 1, '星标段内正常排序不受影响')
    assert.equal(clampPinnedIndex(3, 3, 2), 3, '普通段内正常排序不受影响')
    assert.equal(clampPinnedIndex(0, 3, 0), 0, '没有星标组时不限制')
  })

  await test('命中判定：上下段出排序线，中间窄带才合并', () => {
    // 三张卡片，各 100px 高，zone = 0.3 → 排序带 30px，合并带 40px
    const tops = [0, 110, 220]
    const bottoms = [100, 210, 320]
    const always = (): boolean => true
    const hit = (clientY: number, canMerge: (i: number) => boolean = always): ReturnType<typeof hitTest> =>
      hitTest({ tops, bottoms, clientY, zone: 0.3, canMerge })

    assert.deepEqual(hit(10), { index: 0, mergeIndex: -1 }, '第一张上段 → 插到最前')
    assert.deepEqual(hit(95), { index: 1, mergeIndex: -1 }, '第一张下段 → 插到第二张前')
    assert.deepEqual(hit(105), { index: 1, mergeIndex: -1 }, '卡片之间的空隙 → 仍是插到第二张前')
    assert.deepEqual(hit(50), { index: -1, mergeIndex: 0 }, '第一张中间 → 合并到第一张')
    assert.deepEqual(hit(400), { index: 3, mergeIndex: -1 }, '最后一张下方 → 插到末尾')
  })

  await test('命中判定：自己与锁定组不参与合并，退化为排序', () => {
    const tops = [0]
    const bottoms = [100]
    // 中间带（40~60）但不可合并 → 按上下半判断，60 属于下半 → 插到后面
    assert.deepEqual(hitTest({ tops, bottoms, clientY: 60, zone: 0.3, canMerge: () => false }), { index: 1, mergeIndex: -1 })
    assert.deepEqual(hitTest({ tops, bottoms, clientY: 45, zone: 0.3, canMerge: () => false }), { index: 0, mergeIndex: -1 })
  })

  await test('命中判定：标签拖拽整张卡片都是目标，间隙会吸附', () => {
    const tops = [0, 110, 220]
    const bottoms = [100, 210, 320]
    const tabHit = (clientY: number): ReturnType<typeof hitTest> =>
      hitTest({ tops, bottoms, clientY, zone: 0.3, mergeAnyBand: true, snap: 6, canMerge: () => true })

    assert.deepEqual(tabHit(50), { index: -1, mergeIndex: 0 })
    assert.deepEqual(tabHit(105), { index: -1, mergeIndex: 0 }, '间隙吸附到上一张，不会闪成「新建组」')
    assert.deepEqual(tabHit(300), { index: -1, mergeIndex: 2 })
    assert.deepEqual(tabHit(400), { index: -1, mergeIndex: -1 }, '离所有卡片都远 → 空白处，新建组')
  })

  console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`)
  process.exitCode = failed ? 1 : 0
}

void run()
