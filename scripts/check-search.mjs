/**
 * 「搜索分组名 / 从最近收起定位到组」的端到端验收（无头 Chrome + CDP）。
 *
 * 覆盖的是单元测试管不到的交互链路：
 *   1. 搜关键词命中分组名 → 顶部出现「分组」区块（历史上完全搜不到，只有「没有匹配的标签」）
 *   2. 点分组行 → 清空搜索、滚到该组并高亮描边（不是拿组名去搜标签）
 *   3. list.html#g=<id> 直达 → 同样定位并展开（弹窗「最近收起」用的就是这条）
 *   4. 全都不命中 → 空状态文案要说明「标签或分组」
 *   5. 弹窗不再把组名当搜索词（源码级回归护栏）
 *
 * 用法（三个终端）：
 *   npm run build && npm run demo
 *   npx vite preview --port 4173 --strictPort
 *   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录>
 *   node scripts/check-search.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const BASE = process.env.MYTAB_BASE || 'http://localhost:4173'
const CDP = process.env.MYTAB_CDP || 'http://127.0.0.1:9222'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 页面内工具：输入搜索词、读分组区块、读高亮组 */
const HELPERS = `
window.__s = {
  type(q) {
    const el = document.querySelector('.s-input');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  /** 分组区块里每一行的可读文本 */
  groupRows: () => [...document.querySelectorAll('.g-list .g-row')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()),
  itemCount: () => document.querySelectorAll('.r-list .r-item').length,
  emptyText: () => {
    const el = document.querySelector('.empty-state, .empty');
    return el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
  },
  /** 当前被点亮的分组 id */
  focusedId: () => {
    const el = document.querySelector('.canvas .group.focused');
    return el ? el.dataset.groupId : '';
  },
  /** 被点亮的组是否落在视口里（滚过头 / 没滚都算失败） */
  focusedVisible: () => {
    const el = document.querySelector('.canvas .group.focused');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= -4 && r.top < window.innerHeight - 60;
  },
  /** 高亮组的标题与展开状态 */
  focusedInfo: () => {
    const el = document.querySelector('.canvas .group.focused');
    if (!el) return null;
    return { title: el.querySelector('.g-title').textContent.trim(), collapsed: el.classList.contains('collapsed') };
  },
  groupIdByTitle(part) {
    const el = [...document.querySelectorAll('.canvas [data-group-id]')]
      .find((n) => n.querySelector('.g-title').textContent.includes(part));
    return el ? el.dataset.groupId : '';
  },
  cardTop(id) {
    const el = document.querySelector('.canvas [data-group-id="' + id + '"]');
    return el ? el.getBoundingClientRect().top : -1;
  },
  scrollY: () => Math.round(window.scrollY)
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

  const goto = async (hash = '') => {
    await send('Page.navigate', { url: `${BASE}/__demo.html` })
    await sleep(900)
    await send('Page.navigate', { url: `${BASE}/list.html${hash}` })
    await sleep(1600)
    await evaluate(HELPERS)
  }

  /* ---------------- [1] 搜组名 ---------------- */
  console.log('\n[1] 搜索分组名')
  await goto()
  const ok = await evaluate(`window.__s.type('调研')`)
  if (!ok) {
    console.log('找不到搜索框，请确认已执行 npm run build && npm run demo')
    process.exit(1)
  }
  await sleep(400)

  const rows = await evaluate(`window.__s.groupRows()`)
  check('搜「调研」出现分组区块', rows.length > 0, JSON.stringify(rows))
  check('分组行显示组名与条目数', rows.some((r) => r.includes('调研') && /\d+\s*(个标签|tabs)/.test(r)) || (rows[0] || '').includes('调研'), JSON.stringify(rows))
  const headText = await evaluate(`document.querySelector('.r-head')?.textContent || ''`)
  check('头部文案区分「标签」与「分组」', /分组/.test(headText), headText.trim())

  const shot1 = await send('Page.captureScreenshot', { format: 'png' })
  const file1 = join(tmpdir(), 'mytab-check-search-groups.png')
  writeFileSync(file1, Buffer.from(shot1.data, 'base64'))

  // 分组和条目同时命中：两块结果并存，头部把两种口径都写清楚
  await evaluate(`window.__s.type('Vue')`)
  await sleep(400)
  const mixRows = await evaluate(`window.__s.groupRows()`)
  const mixItems = await evaluate(`window.__s.itemCount()`)
  const mixHead = await evaluate(`document.querySelector('.r-head')?.textContent || ''`)
  check('分组与条目可同时命中', mixRows.length > 0 && mixItems > 0, `groups=${mixRows.length} items=${mixItems}`)
  check('混合命中时头部同时给出两种数量', /条标签/.test(mixHead) && /分组/.test(mixHead), mixHead.trim())

  /* ---------------- [2] 点击分组行 → 定位 ---------------- */
  console.log('\n[2] 点分组行定位到列表里的那个组')
  await evaluate(`document.querySelector('.g-list .g-row').click()`)
  await sleep(900)

  const query = await evaluate(`document.querySelector('.s-input').value`)
  check('搜索被清空（离开搜索态）', query === '', `value=${query}`)
  const stillResults = await evaluate(`!!document.querySelector('.r-list, .g-list')`)
  check('搜索结果区已退出', !stillResults)

  const focusedId = await evaluate(`window.__s.focusedId()`)
  check('目标组被点亮', !!focusedId, `focusedId=${focusedId}`)
  const info = await evaluate(`window.__s.focusedInfo()`)
  check('点亮的是搜到的那个组', !!info && info.title.includes('调研'), JSON.stringify(info))
  check('收起状态被展开（否则滚过去只看到一行）', !!info && !info.collapsed, JSON.stringify(info))
  check('目标组在视口内可见', await evaluate(`window.__s.focusedVisible()`))

  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  const file2 = join(tmpdir(), 'mytab-check-search-focus.png')
  writeFileSync(file2, Buffer.from(shot2.data, 'base64'))

  /* ---------------- [3] 直达 #g=<id>（弹窗最近收起走这条） ---------------- */
  console.log('\n[3] list.html#g=<id> 直达定位')
  await goto()
  const targetId = await evaluate(`window.__s.groupIdByTitle('文件系统')`)
  check('演示数据里能找到目标组', !!targetId, `id=${targetId}`)
  if (targetId) {
    await send('Page.navigate', { url: `${BASE}/list.html#g=${encodeURIComponent(targetId)}` })
    await sleep(1800)
    await evaluate(HELPERS)
    const hit = await evaluate(`window.__s.focusedId()`)
    check('直达 hash 点亮了正确的组', hit === targetId, `${hit} ≠ ${targetId}`)
    check('直达后搜索框为空', (await evaluate(`document.querySelector('.s-input').value`)) === '')
    check('直达后地址栏 hash 被清掉（刷新不再重复定位）', (await evaluate(`location.hash`)) === '', await evaluate(`location.hash`))
    check('直达后目标组在视口内', await evaluate(`window.__s.focusedVisible()`))
  }

  /* ---------------- [4] 全不命中 ---------------- */
  console.log('\n[4] 空结果')
  await goto()
  await evaluate(`window.__s.type('zzz-不存在的关键词')`)
  await sleep(400)
  check('没有分组行', (await evaluate(`window.__s.groupRows()`)).length === 0)
  check('没有条目', (await evaluate(`window.__s.itemCount()`)) === 0)
  const empty = await evaluate(`window.__s.emptyText()`)
  check('空状态说明「标签或分组」', empty.includes('标签') && empty.includes('分组'), empty)

  /* ---------------- [5] 源码护栏 ---------------- */
  console.log('\n[5] 弹窗入口不再拿组名当搜索词')
  const popup = readFileSync(fileURLToPath(new URL('../src/pages/popup/App.vue', import.meta.url)), 'utf8')
  check('popup 不再出现 openList(g.title)', !/openList\(\s*g\.title/.test(popup))
  check('popup 改为按 groupId 定位', /#g=\$\{encodeURIComponent\(g\.id\)\}/.test(popup))

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
