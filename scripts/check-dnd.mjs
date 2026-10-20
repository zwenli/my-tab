/**
 * 拖拽排序的端到端验收（无头 Chrome + CDP，只依赖 Node 内置能力）。
 *
 * 覆盖的是「拖拽这类纯交互 bug」——单元测试管不到事件顺序、状态残留这些坑：
 *   1. 拖到最后一位 → 是否真的落到第一位（历史 bug：落到末尾）
 *   2. 拖拽取消（Esc / dragend）后插入线是否消失（历史 bug：线残留）
 *   3. 拖出画布后标记是否立即清除、松手是否不改顺序
 *   4. 卡片上/下段只排序、中间窄带才合并（避免误合并）
 *   5. 星标置顶时插入点是否被夹在所属分段内（否则线画的位置和结果不一致）
 *
 * 用法（三个终端）：
 *   npm run build && npm run demo
 *   npx vite preview --port 4173 --strictPort
 *   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录>
 *   npm run check:dnd
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.MYTAB_BASE || 'http://localhost:4173'
const CDP = process.env.MYTAB_CDP || 'http://127.0.0.1:9222'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 页面内工具：按 clientY 模拟一次 Html5 拖拽序列 */
const HELPERS = `
window.__dnd = {
  cards: () => [...document.querySelectorAll('.canvas [data-group-id]')],
  titles: () => window.__dnd.cards().map((n) => n.querySelector('.g-title').textContent.trim()),
  rect(i) {
    const r = this.cards()[i].getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2 };
  },
  lines: () => document.querySelectorAll('.drop-line').length,
  /** 插入线落在第几位 */
  lineIndex() {
    const line = document.querySelector('.drop-line');
    if (!line) return -1;
    const barY = line.getBoundingClientRect().top + 3;
    const cards = this.cards();
    for (let i = 0; i < cards.length; i++) if (barY <= cards[i].getBoundingClientRect().top) return i;
    return cards.length;
  },
  targets: () => document.querySelectorAll('.canvas .group.target').length,
  dt: null,
  start(i) {
    this.dt = new DataTransfer();
    this.cards()[i].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: this.dt }));
  },
  fire(type, y) {
    const canvas = document.querySelector('.canvas');
    const hit = document.elementFromPoint(600, y) || canvas;
    for (const el of hit === canvas ? [canvas] : [hit, canvas]) {
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: this.dt, clientX: 600, clientY: y }));
    }
  },
  over(y) { this.fire('dragover', y) },
  drop(y) { this.dt = this.dt || new DataTransfer(); this.fire('drop', y) },
  leave(y) {
    document.querySelector('.canvas').dispatchEvent(new DragEvent('dragleave', { bubbles: true, clientX: 600, clientY: y }));
  },
  end(i) {
    const card = this.cards()[i] || document.querySelector('.canvas [data-group-id]');
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: this.dt || new DataTransfer() }));
  },
  tick: () => new Promise((r) => setTimeout(r, 150))
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

  /** 载入演示数据并进入列表页；pin 为 null 表示不改设置 */
  const goto = async (pin) => {
    await send('Page.navigate', { url: `${BASE}/__demo.html` })
    await sleep(1000)
    if (pin !== null) {
      await evaluate(`(() => {
        const s = JSON.parse(localStorage.getItem('mytab:state') || '{}');
        s.settings = Object.assign({}, s.settings, { starPinsToTop: ${pin} });
        localStorage.setItem('mytab:state', JSON.stringify(s));
      })()`)
    }
    await send('Page.navigate', { url: `${BASE}/list.html` })
    await sleep(1600)
    await evaluate(HELPERS)
    return evaluate(`window.__dnd.cards().length`)
  }

  /* ---------------- 星标置顶开启 ---------------- */
  let n = await goto(true)
  if (!n) {
    console.log('页面没有渲染出卡片，请确认已执行 npm run build && npm run demo')
    process.exit(1)
  }
  const titles1 = await evaluate(`window.__dnd.titles()`)
  const starred = await evaluate(`window.__dnd.cards()[0].querySelector('.b-star') ? window.__dnd.titles()[0] : ''`)
  const expectPin = starred ? 1 : 0
  console.log(`\n[1] 星标置顶开启 · ${n} 组${starred ? ` · 首组星标：${starred}` : ''}`)

  await evaluate(`window.__dnd.start(${n - 1})`)
  await evaluate(`window.__dnd.over(window.__dnd.rect(0).top + 4)`)
  await sleep(120)
  const pinLine = await evaluate(`window.__dnd.lineIndex()`)
  check('非星标组拖到最顶 → 插入线停在星标段之后', pinLine === expectPin, `lineIndex=${pinLine}，期望 ${expectPin}`)

  await evaluate(`window.__dnd.drop(window.__dnd.rect(0).top + 4)`)
  await evaluate(`window.__dnd.tick()`)
  await sleep(200)
  await evaluate(`window.__dnd.end(0)`)
  await sleep(150)
  const afterPin = await evaluate(`window.__dnd.titles()`)
  check(
    '插入线与落点一致',
    afterPin.indexOf(titles1[n - 1]) === expectPin,
    `期望第 ${expectPin} 位，实际第 ${afterPin.indexOf(titles1[n - 1])} 位 · ${afterPin.join(' | ')}`
  )
  check('星标组仍排第一', !starred || afterPin[0] === starred, afterPin.join(' | '))

  /* ---------------- 关闭星标置顶 ---------------- */
  n = await goto(false)
  const titles2 = await evaluate(`window.__dnd.titles()`)
  const last = n - 1
  console.log(`\n[2] 关闭星标置顶 · ${titles2.join(' | ')}`)

  // 最后一位 → 第一位
  const top0 = await evaluate(`window.__dnd.rect(0).top`)
  await evaluate(`window.__dnd.start(${last})`)
  await evaluate(`window.__dnd.over(${top0 + 4})`)
  await sleep(120)
  const shifted = await evaluate(`window.__dnd.cards()[0].getBoundingClientRect().top`)
  check('插入线出现后卡片不位移', Math.abs(shifted - top0) < 1, `${top0} → ${shifted}`)
  check('插入线画在第 0 位', (await evaluate(`window.__dnd.lineIndex()`)) === 0)

  await evaluate(`window.__dnd.drop(${top0 + 4})`)
  await evaluate(`window.__dnd.tick()`)
  await sleep(200)
  await evaluate(`window.__dnd.end(0)`)
  await sleep(150)
  const orderTop = await evaluate(`window.__dnd.titles()`)
  check(`拖到最后一位 → 落到第一位（${orderTop[0]}）`, orderTop[0] === titles2[last], `${orderTop.join(' | ')}`)
  check('松手后插入线消失', (await evaluate(`window.__dnd.lines()`)) === 0)

  // 第一位 → 第 3 位前
  const moved = orderTop[0]
  const t3 = await evaluate(`window.__dnd.rect(3).top`)
  await evaluate(`window.__dnd.start(0)`)
  await evaluate(`window.__dnd.over(${t3 + 4})`)
  await sleep(120)
  check('向下拖时插入线画在第 3 位', (await evaluate(`window.__dnd.lineIndex()`)) === 3)
  await evaluate(`window.__dnd.drop(${t3 + 4})`)
  await evaluate(`window.__dnd.tick()`)
  await sleep(200)
  await evaluate(`window.__dnd.end(0)`)
  await sleep(150)
  const orderMid = await evaluate(`window.__dnd.titles()`)
  const at = orderMid.indexOf(moved)
  check(
    '向下拖后夹在原第 3 位前后两组之间',
    at > 0 && orderMid[at - 1] === orderTop[2] && orderMid[at + 1] === orderTop[3],
    orderMid.join(' | ')
  )

  // 取消拖拽
  await evaluate(`window.__dnd.start(0)`)
  await evaluate(`window.__dnd.over(window.__dnd.rect(3).top + 4)`)
  await sleep(120)
  const beforeCancel = await evaluate(`window.__dnd.lines()`)
  await evaluate(`window.__dnd.end(0)`)
  await sleep(150)
  const afterCancel = await evaluate(`({ lines: window.__dnd.lines(), targets: window.__dnd.targets() })`)
  check('取消前插入线出现过', beforeCancel === 1)
  check('取消拖拽后插入线消失', afterCancel.lines === 0, JSON.stringify(afterCancel))
  check('取消拖拽后合并高亮消失', afterCancel.targets === 0, JSON.stringify(afterCancel))

  // 拖出画布
  const beforeLeave = await evaluate(`window.__dnd.titles()`)
  await evaluate(`window.__dnd.start(0)`)
  await evaluate(`window.__dnd.over(window.__dnd.rect(2).top + 4)`)
  await sleep(100)
  await evaluate(`window.__dnd.leave(2)`)
  await sleep(100)
  const left = await evaluate(`({ lines: window.__dnd.lines(), targets: window.__dnd.targets() })`)
  await evaluate(`window.__dnd.end(0)`)
  await sleep(120)
  const afterLeave = await evaluate(`window.__dnd.titles()`)
  check('拖出画布后标记立即清除', left.lines === 0 && left.targets === 0, JSON.stringify(left))
  check('拖出画布松手不改顺序', afterLeave.join() === beforeLeave.join(), `${beforeLeave.join()} → ${afterLeave.join()}`)

  // 分段：上段排序 / 中间合并
  const r2 = await evaluate(`window.__dnd.rect(2)`)
  await evaluate(`window.__dnd.start(0)`)
  await evaluate(`window.__dnd.over(${r2.top + 4})`)
  await sleep(120)
  const upper = await evaluate(`({ lines: window.__dnd.lines(), targets: window.__dnd.targets() })`)
  check('卡片上段 → 只有插入线', upper.lines === 1 && upper.targets === 0, JSON.stringify(upper))

  await evaluate(`window.__dnd.over(${r2.mid})`)
  await sleep(120)
  const middle = await evaluate(`({ lines: window.__dnd.lines(), targets: window.__dnd.targets() })`)
  check('卡片中间带 → 只有合并高亮', middle.lines === 0 && middle.targets === 1, JSON.stringify(middle))
  await evaluate(`window.__dnd.end(0)`)
  await sleep(120)

  // 真正合并
  const beforeMerge = await evaluate(`window.__dnd.cards().length`)
  const mergeY = await evaluate(`window.__dnd.rect(2).mid`)
  await evaluate(`window.__dnd.start(1)`)
  await evaluate(`window.__dnd.over(${mergeY})`)
  await sleep(120)
  await evaluate(`window.__dnd.drop(${mergeY})`)
  await evaluate(`window.__dnd.tick()`)
  await sleep(250)
  const afterMerge = await evaluate(`({ n: window.__dnd.cards().length, lines: window.__dnd.lines() })`)
  check('中间带松手 → 合并成一组', afterMerge.n === beforeMerge - 1, `${beforeMerge} → ${afterMerge.n}`)
  check('合并后无残留插入线', afterMerge.lines === 0, `lines=${afterMerge.lines}`)

  // 留一张截图便于人工复核
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const out = join(tmpdir(), 'mytab-check-dnd.png')
  writeFileSync(out, Buffer.from(shot.data, 'base64'))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n结果：${results.length - failed.length} 通过 / ${failed.length} 失败`)
  console.log(`截图：${out}`)
  ws.close()
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('运行失败：', e)
  process.exit(1)
})
