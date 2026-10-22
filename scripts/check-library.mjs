/**
 * 资料库「重启后绑定失效」的端到端验收（无头 Chrome + CDP）。
 *
 * 复现的是真实用户的场景：Chrome 对 File System Access 的授权是**按会话**的，
 * 关掉浏览器再打开后 `queryPermission()` 会退回 `prompt`，但 IndexedDB 里的目录句柄还在。
 * 历史 bug 是直接把这种状态当成「未连接」，界面显示「尚未连接资料库，数据暂存在本机」，
 * 用户只能重新选一遍文件夹。
 *
 * 验收点：
 *   1. permission=prompt 时列表页出现提示条，文案是「需要重新确认」并带文件夹名
 *   2. 第一次点击自动补授权（复用句柄，不弹文件夹选择器）→ 提示条消失
 *   3. 手动点「恢复访问」同样能恢复，并给出成功提示
 *   4. 设置页卡片说的是「已绑定…确认一次即可」，而不是「尚未连接资料库」
 *
 * 用法（三个终端）：
 *   pnpm build && pnpm demo
 *   npx vite preview --port 4173 --strictPort
 *   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录>
 *   pnpm check:library
 *
 * 桩说明：indexedDB 是只读属性，必须用 Object.defineProperty 覆盖；
 * 桩里的句柄只有 name / queryPermission / requestPermission，
 * 扫描目录时拿不到任何条目，因此不会碰真实文件系统。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.MYTAB_BASE || 'http://localhost:4173'
const CDP = process.env.MYTAB_CDP || 'http://127.0.0.1:9222'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------------------- 生成带桩的页面 ---------------------------- */

const STUB = `<script>
window.__fsState = { perm: 'prompt', pickCalls: 0, requestCalls: 0, opens: 0, keys: [] };
const handle = {
  name: 'MyTab-库', kind: 'directory',
  queryPermission: async () => window.__fsState.perm,
  requestPermission: async () => { window.__fsState.requestCalls++; window.__fsState.perm = 'granted'; return 'granted'; }
};
Object.defineProperty(window, 'showDirectoryPicker', {
  value: async () => { window.__fsState.pickCalls++; window.__fsState.perm = 'granted'; return handle; },
  configurable: true, writable: true
});
const fakeDb = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => ({}),
  transaction: () => {
    const tx = {};
    const store = {
      get: (k) => {
        window.__fsState.keys.push(String(k));
        const r = {};
        setTimeout(() => {
          r.result = String(k).indexOf('libraryDir') >= 0 ? handle : undefined;
          if (r.onsuccess) r.onsuccess();
        }, 0);
        return r;
      },
      put: () => { setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); return {}; },
      delete: () => { setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); return {}; }
    };
    tx.objectStore = () => store;
    return tx;
  }
};
const fakeIDB = {
  open: () => {
    window.__fsState.opens++;
    const req = {};
    setTimeout(() => { req.result = fakeDb; if (req.onsuccess) req.onsuccess(); }, 0);
    return req;
  }
};
Object.defineProperty(window, 'indexedDB', { value: fakeIDB, configurable: true, writable: true });
</script>`

/** 把桩注入 dist 里的页面，产出验收页 */
function makePage(from, to) {
  const src = readFileSync(new URL(`../dist/${from}`, import.meta.url), 'utf8')
  writeFileSync(new URL(`../dist/${to}`, import.meta.url), src.replace('</head>', `${STUB}\n</head>`))
}

/* ---------------------------- CDP ---------------------------- */

async function connect() {
  const list = await (await fetch(`${CDP}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('没有可用的页面，请先启动无头 Chrome')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
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
  return { send, evaluate }
}

let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
  }
}

const BAR = `(() => {
  const bar = document.querySelector('.lib-bar');
  if (!bar) return null;
  const btn = bar.querySelector('button');
  return { text: bar.innerText.replace(/\\s+/g, ' ').trim(), btn: btn ? btn.innerText.trim() : '' };
})()`

const SETTINGS_CARD = `(() => {
  const sec = [...document.querySelectorAll('section.sec')].find((x) => x.querySelector('.tree'));
  return sec ? sec.innerText.replace(/\\s+/g, ' ').trim() : null;
})()`

/* ---------------------------- 主流程 ---------------------------- */

const run = async () => {
  makePage('list.html', '__lib.html')
  makePage('options.html', '__lib-options.html')

  const { send, evaluate } = await connect()
  await send('Page.enable')
  await send('Runtime.enable')

  const open = async (page, wait = 1800) => {
    await send('Page.navigate', { url: `${BASE}/${page}` })
    await sleep(wait)
  }

  // 铺一份演示数据（同源 localStorage），再进带桩的列表页
  await open('__demo.html', 900)
  await open('__lib.html')

  const st0 = await evaluate('({ ...window.__fsState })')
  console.log('\n[0] 环境')
  check('indexedDB 桩已生效', st0.opens > 0, `opens=${st0.opens}`)

  console.log('\n[1] 重启后：句柄还在、权限被重置成 prompt')
  const bar = await evaluate(BAR)
  check('提示条出现', !!bar, JSON.stringify(bar))
  check('说明「需要重新确认」，不是「尚未连接资料库」', !!bar && bar.text.includes('重新确认'), bar?.text)
  check('文案带文件夹名', !!bar && bar.text.includes('MyTab-库'), bar?.text)
  check('按钮是「恢复访问」而不是「选择 / 新建」', !!bar && bar.btn.includes('恢复访问'), bar?.btn)
  check('没有弹文件夹选择器', st0.pickCalls === 0, `pickCalls=${st0.pickCalls}`)

  console.log('\n[2] 第一次点击页面任意处 → 自动补授权')
  await evaluate(`document.querySelector('.content').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
  await sleep(900)
  const st1 = await evaluate('({ ...window.__fsState })')
  check('调用了 requestPermission（复用已有句柄）', st1.requestCalls >= 1, `requestCalls=${st1.requestCalls}`)
  check('没有弹文件夹选择器', st1.pickCalls === 0, `pickCalls=${st1.pickCalls}`)
  check('恢复后提示条自动消失', (await evaluate(BAR)) === null)

  console.log('\n[3] 再重置一次 → 手动点「恢复访问」')
  await evaluate(`window.__fsState.perm = 'prompt'`)
  await send('Page.reload', {})
  await sleep(1900)
  const again = await evaluate(BAR)
  check('提示条再次出现', !!again, JSON.stringify(again))
  if (again) {
    await evaluate(`document.querySelector('.lib-bar button').click()`)
    await sleep(1000)
    check('点按钮后提示条消失', (await evaluate(BAR)) === null)
    const toast = await evaluate(`(() => { const el = document.querySelector('.toasts'); return el ? el.innerText.replace(/\\s+/g, ' ').trim() : '' })()`)
    check('给出恢复成功提示', /恢复|写入/.test(toast), toast)
    check('全程没有弹文件夹选择器', (await evaluate('window.__fsState.pickCalls')) === 0)
  }

  console.log('\n[4] 设置页资料库卡片')
  await evaluate(`window.__fsState.perm = 'prompt'`)
  await open('__lib-options.html#library', 2000)
  const card = await evaluate(SETTINGS_CARD)
  check('卡片显示已绑定 + 需确认，而不是「尚未连接资料库」', !!card && card.includes('已绑定') && !card.includes('尚未连接资料库'), String(card).slice(0, 160))
  check('卡片有「恢复访问」按钮', await evaluate(`[...document.querySelectorAll('button')].some((b) => b.innerText.includes('恢复访问'))`))
  check('授权状态写的是「待确认」', !!card && card.includes('待确认'), String(card).slice(0, 160))

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`)
  process.exitCode = fail ? 1 : 0
  process.exit(fail ? 1 : 0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
