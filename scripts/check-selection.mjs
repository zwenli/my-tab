/**
 * 多选「删除勾选」的端到端验收（无头 Chrome + CDP）。
 *
 * 历史 bug：勾选整组 → 点「删除选中」→ 组没被删掉。
 * 根因是「分组 id」和「条目 id」曾经混在同一个选中集合里，而删除只走 removeItems
 * （按条目 id 查找），分组 id 查不到就静默跳过 —— 弹窗关了、toast 还报成功。
 *
 * 覆盖三条路径：
 *   1. 只勾整组 → 删除：组真的消失（DOM + 落盘数据都验）
 *   2. 组 + 条目混合勾选 → 删除：组的条目不重复处理，另一个组的条目被精确删掉
 *   3. 勾到锁定组 → 删除：跳过该组并给出提示，其余照常删
 *   4. 勾到锁定组 + 普通组 → 删除：锁定组保留、普通组照删
 *   5. 「移动到组」下拉菜单：必须渲染到 <body> 且不被操作条裁掉/盖住（历史 bug：
 *      菜单挂在 .bar 里，被 overflow-x:auto 剪掉，点了看不到），并能把整组并入目标组
 *
 * 用法（三个终端）：
 *   pnpm build && pnpm demo
 *   pnpm preview
 *   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录>
 *   pnpm check:selection
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.MYTAB_BASE || 'http://localhost:4173'
const CDP = process.env.MYTAB_CDP || 'http://127.0.0.1:9222'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 页面内工具：进多选、勾组/勾条目、点操作条、读落盘数据 */
const HELPERS = `
window.__sel = {
  cards: () => [...document.querySelectorAll('.canvas .card.group')],
  titles: () => window.__sel.cards().map((n) => n.querySelector('.g-title').textContent.trim()),
  card(part) {
    return window.__sel.cards().find((n) => n.querySelector('.g-title').textContent.includes(part)) || null;
  },
  enterSelect() {
    const b = [...document.querySelectorAll('.sec-head button')].find((x) => x.textContent.includes('多选'));
    if (!b) return false;
    b.click();
    return true;
  },
  checkGroup(part) {
    const c = window.__sel.card(part);
    if (!c) return false;
    const i = c.querySelector('.head .check input');
    if (!i) return false;
    i.click();
    return true;
  },
  checkItem(part) {
    const row = [...document.querySelectorAll('.canvas .card.group .row')].find((n) => (n.textContent || '').includes(part));
    if (!row) return false;
    const i = row.querySelector('.check input');
    if (!i) return false;
    i.click();
    return true;
  },
  boxCount: () => document.querySelectorAll('.canvas .card.group .head .check input').length,
  bar: () => !!document.querySelector('.bar'),
  barCount: () => (document.querySelector('.bar .count')?.textContent || '').replace(/\\s+/g, ' ').trim(),
  barClick(text) {
    const b = [...document.querySelectorAll('.bar button')].find((x) => x.textContent.includes(text));
    if (!b) return false;
    b.click();
    return true;
  },
  dialogText: () => (document.querySelector('.overlay .panel')?.textContent || '').replace(/\\s+/g, ' ').trim(),
  confirm() {
    const b = document.querySelector('.overlay .panel .foot .btn-danger-solid, .overlay .panel .foot .btn-primary');
    if (!b) return false;
    b.click();
    return true;
  },
  toasts: () => [...document.querySelectorAll('.toasts .toast')].map((n) => n.textContent.replace(/\\s+/g, ' ').trim()),
  savedGroups: () => JSON.parse(localStorage.getItem('mytab:state') || '{}').groups || [],
  savedTitles: () => window.__sel.savedGroups().map((g) => g.title || ''),
  savedItemTitles: () => window.__sel.savedGroups().flatMap((g) => g.items.map((i) => i.title || '')),
  savedGroupByTitle(part) {
    const g = window.__sel.savedGroups().find((x) => (x.title || '').includes(part));
    return g ? { title: g.title, items: g.items.length } : null;
  },
  /* ---- 「移动到组」下拉菜单（被测的是 DropdownMenu 的 teleport 定位） ---- */
  openMoveMenu() {
    const b = document.querySelector('.bar .dd .trigger');
    if (!b) return false;
    b.click();
    return true;
  },
  menu: () => document.querySelector('body > .menu'),
  menuInfo() {
    const m = window.__sel.menu();
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      items: [...m.querySelectorAll('.mi')].map((n) => n.textContent.trim()),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      parentIsBody: m.parentElement === document.body,
      inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
      hitInsideMenu: !!(hit && m.contains(hit))
    };
  },
  menuClick(text) {
    const m = window.__sel.menu();
    if (!m) return false;
    const b = [...m.querySelectorAll('.mi')].find((x) => x.textContent.includes(text));
    if (!b) return false;
    b.click();
    return true;
  }
};
true
`

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`)
}

async function connect() {
  let list
  try {
    list = await (await fetch(`${CDP}/json/list`)).json()
  } catch {
    console.error(`连不上 ${CDP}，请先启动无头 Chrome：`)
    console.error('  chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录>')
    process.exit(2)
  }
  const target = list.find((t) => t.type === 'page')
  if (!target) {
    console.error('没有可用的页面 target')
    process.exit(2)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))

  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (!msg.id || !pending.has(msg.id)) return
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'eval failed')
    return res.result.value
  }

  return { ws, send, evaluate }
}

const main = async () => {
  const { ws, send, evaluate } = await connect()
  await send('Page.enable')
  await send('Runtime.enable')

  const goto = async () => {
    await send('Page.navigate', { url: `${BASE}/__demo.html` })
    await sleep(900)
    await send('Page.navigate', { url: `${BASE}/list.html` })
    await sleep(1600)
    await evaluate(HELPERS)
  }

  const enterSelect = async () => {
    const ok = await evaluate(`window.__sel.enterSelect()`)
    await sleep(350)
    return ok
  }

  /* ---------------- [1] 只勾整组 → 删除 ---------------- */
  console.log('\n[1] 勾选整组后删除')
  await goto()
  check('进入多选模式', await enterSelect())
  check('分组卡片出现勾选框', (await evaluate(`window.__sel.boxCount()`)) > 0)

  const before = await evaluate(`window.__sel.titles()`)
  check('勾选「文件系统与同步方案」整组', await evaluate(`window.__sel.checkGroup('文件系统与同步方案')`))
  await sleep(250)
  const count1 = await evaluate(`window.__sel.barCount()`)
  check('操作条显示已选 1 项', /1/.test(count1), count1)

  check('点「删除选中」', await evaluate(`window.__sel.barClick('删除选中')`))
  await sleep(300)
  const dlg = await evaluate(`window.__sel.dialogText()`)
  check('确认框文案点明「分组」', dlg.includes('分组'), dlg)
  check('按下确认', await evaluate(`window.__sel.confirm()`))
  await sleep(800)

  const after = await evaluate(`window.__sel.titles()`)
  check('分组从画布消失（历史 bug 在这里）', !after.some((x) => x.includes('文件系统')), after.join(' | '))
  check('分组数量正好减 1', after.length === before.length - 1, `${before.length} → ${after.length}`)
  const savedTitles = await evaluate(`window.__sel.savedTitles()`)
  check('资料库数据里该分组也被删掉', !savedTitles.some((x) => x.includes('文件系统')), savedTitles.join(' | '))
  check('删除后自动退出多选（操作条消失）', !(await evaluate(`window.__sel.bar()`)))

  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  const file1 = join(tmpdir(), 'mytab-check-selection-group.png')
  writeFileSync(file1, Buffer.from(shot1.data, 'base64'))

  /* ---------------- [2] 组 + 条目混合删除 ---------------- */
  console.log('\n[2] 组 + 条目混合勾选后删除')
  await goto()
  await enterSelect()
  check('勾选整组「Vue 3 组合式 API 调研」', await evaluate(`window.__sel.checkGroup('Vue 3 组合式 API 调研')`))
  check('再勾选另一组里的一条标签', await evaluate(`window.__sel.checkItem('IndexedDB API')`))
  await sleep(250)
  const count2 = await evaluate(`window.__sel.barCount()`)
  check('操作条显示已选 2 项', /2/.test(count2), count2)

  await evaluate(`window.__sel.barClick('删除选中')`)
  await sleep(300)
  const dlg2 = await evaluate(`window.__sel.dialogText()`)
  check('确认框同时提到分组与标签', dlg2.includes('分组') && dlg2.includes('标签'), dlg2)
  await evaluate(`window.__sel.confirm()`)
  await sleep(800)

  const titles2 = await evaluate(`window.__sel.titles()`)
  check('整组被删掉', !titles2.some((x) => x.includes('Vue 3 组合式 API')), titles2.join(' | '))
  const fsGroup = await evaluate(`window.__sel.savedGroupByTitle('文件系统')`)
  check('另一组仍然存在', !!fsGroup, JSON.stringify(fsGroup))
  check('该组只剩 3 条（被删掉 1 条）', !!fsGroup && fsGroup.items === 3, JSON.stringify(fsGroup))
  const savedItems = await evaluate(`window.__sel.savedItemTitles()`)
  check('选中的那条标签已消失', !savedItems.includes('IndexedDB API'))

  /* ---------------- [3] 锁定组 ---------------- */
  console.log('\n[3] 勾选锁定组')
  await goto()
  await enterSelect()
  check('勾选锁定组「Chrome 扩展开发」', await evaluate(`window.__sel.checkGroup('Chrome 扩展开发')`))
  await sleep(250)
  await evaluate(`window.__sel.barClick('删除选中')`)
  await sleep(300)
  await evaluate(`window.__sel.confirm()`)
  await sleep(600)

  const savedLocked = await evaluate(`window.__sel.savedGroupByTitle('Chrome 扩展开发')`)
  check('锁定组没有被删除', !!savedLocked, JSON.stringify(savedLocked))
  const toasts = await evaluate(`window.__sel.toasts()`)
  check('只选了锁定组时直接提示无法删除', toasts.some((x) => x.includes('无法删除')), toasts.join(' | '))

  /* ---------------- [4] 锁定组 + 普通组一起删 ---------------- */
  console.log('\n[4] 锁定组与普通组混合删除')
  await goto()
  await enterSelect()
  await evaluate(`window.__sel.checkGroup('Chrome 扩展开发')`)
  await evaluate(`window.__sel.checkGroup('文件系统与同步方案')`)
  await sleep(250)
  await evaluate(`window.__sel.barClick('删除选中')`)
  await sleep(300)
  await evaluate(`window.__sel.confirm()`)
  await sleep(600)

  const locked2 = await evaluate(`window.__sel.savedGroupByTitle('Chrome 扩展开发')`)
  const plain2 = await evaluate(`window.__sel.savedGroupByTitle('文件系统')`)
  check('锁定组保留', !!locked2, JSON.stringify(locked2))
  check('普通组照常删除', !plain2, JSON.stringify(plain2))
  const toasts2 = await evaluate(`window.__sel.toasts()`)
  check('提示跳过了 1 个锁定分组', toasts2.some((x) => x.includes('跳过') && x.includes('1')), toasts2.join(' | '))

  /* ---------------- [5] 移动到组：菜单不能被操作条裁掉 ---------------- */
  console.log('\n[5] 「移动到组」下拉菜单')
  await goto()
  await enterSelect()
  check('勾选整组「Vue 3 组合式 API 调研」', await evaluate(`window.__sel.checkGroup('Vue 3 组合式 API 调研')`))
  await sleep(250)
  check('点开「移动到组」', await evaluate(`window.__sel.openMoveMenu()`))
  await sleep(400)

  const menu = await evaluate(`window.__sel.menuInfo()`)
  check('菜单渲染到 <body>（历史 bug：被操作条的 overflow 裁掉）', !!menu && menu.parentIsBody, JSON.stringify(menu))
  check('菜单完整落在视口内', !!menu && menu.inViewport, JSON.stringify(menu))
  check('菜单中心点命中的是菜单自己（没被遮罩盖住）', !!menu && menu.hitInsideMenu, JSON.stringify(menu))
  check('菜单列出了「新建分组 + 各分组」', !!menu && menu.items.length >= 6, JSON.stringify(menu?.items))

  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  const file2 = join(tmpdir(), 'mytab-check-selection-menu.png')
  writeFileSync(file2, Buffer.from(shot2.data, 'base64'))

  check('从菜单里选目标组', await evaluate(`window.__sel.menuClick('文件系统与同步方案')`))
  await sleep(900)
  const merged = await evaluate(`window.__sel.savedGroupByTitle('文件系统')`)
  check('整组并入目标组（4 + 6 = 10 条）', !!merged && merged.items === 10, JSON.stringify(merged))
  const titles3 = await evaluate(`window.__sel.titles()`)
  check('源分组已消失', !titles3.some((x) => x.includes('Vue 3 组合式 API')), titles3.join(' | '))

  const failed = results.filter((r) => !r.ok).length
  console.log(`\n结果：${results.length - failed} 通过 / ${failed} 失败`)
  console.log(`截图：${file1}`)
  console.log(`截图：${file2}`)
  ws.close()
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
