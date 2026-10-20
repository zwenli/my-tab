/**
 * 分享：把某个标签组打包成
 *   1) 可分享链接 —— `chrome-extension://<id>/share.html#d=<payload>`（装了扩展的设备可直接打开）
 *   2) 独立 HTML 文件 —— 完全自包含（内联样式 + 数据），发给任何人都能双击打开
 *   3) 纯文本 —— 便于直接粘贴到聊天窗口
 *
 * 载荷使用 deflate-raw 压缩 + base64url 编码；压缩不可用时退化为 base64(JSON)。
 * 这是本扩展唯一会把数据对外输出的功能，且必须由用户主动触发。
 */
import { SCHEMA_VERSION, SHARE_FORMAT } from './constants'
import { now } from './utils'
import type { ShareBundle, SharePayload, TabItem } from '../types'

/* --------------------------- 编码 / 解码 --------------------------- */

const pad2 = (n: number): string => String(n).padStart(2, '0')

const hasCompression = (): boolean =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipeThrough(bytes: Uint8Array, stream: ReadableWritablePair<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart])
  const out = blob.stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** 任意对象 → 紧凑字符串 */
export async function packPayload(obj: unknown): Promise<string> {
  const json = JSON.stringify(obj)
  const bytes = new TextEncoder().encode(json)
  if (!hasCompression() || bytes.length < 200) return `j.${bytesToBase64Url(bytes)}`
  try {
    const deflated = await pipeThrough(bytes, new CompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>)
    return `z.${bytesToBase64Url(deflated)}`
  } catch {
    return `j.${bytesToBase64Url(bytes)}`
  }
}

/** 紧凑字符串 → 对象 */
export async function unpackPayload<T = SharePayload>(str: string): Promise<T | null> {
  if (!str) return null
  const dot = str.indexOf('.')
  const tag = dot >= 0 ? str.slice(0, dot) : 'j'
  const body = dot >= 0 ? str.slice(dot + 1) : str
  if (!body) return null
  try {
    let bytes = base64UrlToBytes(body)
    if (tag === 'z') {
      if (!hasCompression()) return null
      bytes = await pipeThrough(bytes, new DecompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>)
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

/* --------------------------- 载荷构造 --------------------------- */

export interface ShareItemInput {
  url: string
  title?: string
  starred?: boolean
}

export interface BuildPayloadInput {
  title?: string
  note?: string
  items?: ShareItemInput[]
  color?: string | null
  source?: string
}

/** 由一组条目构造分享载荷 */
export function buildPayload({ title = '', note = '', items = [], color = null, source = 'MyTab' }: BuildPayloadInput = {}): SharePayload {
  return {
    format: SHARE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    title: String(title || '').trim(),
    note: String(note || '').trim(),
    color,
    createdAt: now(),
    source,
    items: (items || []).map((it) => ({
      url: it.url,
      title: (it.title || it.url || '').replace(/[\r\n]+/g, ' ').trim(),
      starred: !!it.starred
    }))
  }
}

const escapeHtml = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* --------------------------- 分享链接 --------------------------- */

/** 生成扩展内可打开的分享链接 */
export function buildShareUrl(payloadStr: string): string {
  const base =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('share.html')
      : new URL('share.html', location.href).href
  return `${base}#d=${payloadStr}`
}

/** 估算二维码能否装下该链接（QR 版本 40 / EC=L 上限约 2953 字节） */
export function qrCapacityOk(url: string): boolean {
  return new TextEncoder().encode(url).length <= 2900
}

/** 一次性生成分享所需的全部内容 */
export async function buildShareBundle(input: BuildPayloadInput): Promise<ShareBundle> {
  const payload = buildPayload(input)
  const packed = await packPayload(payload)
  return { payload, packed, url: buildShareUrl(packed) }
}

/* --------------------------- 独立 HTML --------------------------- */

/** 生成完全自包含的分享页 HTML（离线可用，发给任何人都能打开） */
export function renderStandaloneHtml(payload: SharePayload): string {
  const { title, note, items = [], createdAt } = payload
  const d = new Date(createdAt || now())
  const stampText = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const heading = title || `${stampText} · ${items.length} 个标签`

  const rows = items
    .map((it, i) => {
      const host = hostOf(it.url)
      return `      <li class="item">
        <span class="idx">${i + 1}</span>
        <a class="link" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">
          <span class="name">${escapeHtml(it.title || it.url)}${it.starred ? ' <span class="star">★</span>' : ''}</span>
          <span class="host">${escapeHtml(host)}</span>
        </a>
      </li>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(heading)} — MyTab 分享</title>
<style>
  :root {
    --bg: #0f141a; --surface: #161d26; --surface-2: #1d2733;
    --border: #2b3846; --text: #e9edf3; --muted: #93a2b5;
    --primary: #5b9bff; --radius: 14px;
    --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 20px 80px; background: var(--bg); color: var(--text);
    font-family: var(--font); font-size: 15px; line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  .brand { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 13px; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 14px; }
  .dot { width: 10px; height: 10px; border-radius: 3px; background: linear-gradient(180deg,#3C7FE0,#1E4E9C); }
  h1 { margin: 0 0 8px; font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
  .meta { color: var(--muted); font-size: 13px; }
  .note { margin-top: 14px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--primary); border-radius: 10px; color: #c9d4e2; font-size: 14px; white-space: pre-wrap; }
  .card { margin-top: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  ul { list-style: none; margin: 0; padding: 6px; }
  .item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 12px; border-radius: 10px; transition: background .15s ease; }
  .item:hover { background: var(--surface-2); }
  .idx { flex: none; width: 22px; text-align: right; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; padding-top: 2px; }
  .link { flex: 1; min-width: 0; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 2px; }
  .name { color: var(--text); font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  .link:hover .name { color: var(--primary); }
  .star { color: #f5b942; }
  .host { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  footer { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; color: var(--muted); font-size: 12px; }
  button { font: inherit; font-size: 13px; padding: 8px 14px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; }
  button:hover { border-color: var(--primary); color: var(--primary); }
  .actions { display: flex; gap: 8px; }
  @media (max-width: 520px) { body { padding: 24px 12px 60px; } h1 { font-size: 21px; } }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand"><span class="dot"></span> MyTab 分享的标签组</div>
      <h1>${escapeHtml(heading)}</h1>
      <div class="meta">${items.length} 个标签 · 生成于 ${stampText}</div>
      ${note ? `<div class="note">${escapeHtml(note)}</div>` : ''}
    </header>
    <main class="card">
      <ul>
${rows}
      </ul>
    </main>
    <footer>
      <span>由 MyTab 生成 · 本页面为离线单文件，可直接分享</span>
      <div class="actions">
        <button type="button" id="copyAll">复制全部链接</button>
        <button type="button" id="openAll">全部打开</button>
      </div>
    </footer>
  </div>
<script>
  const URLS = ${JSON.stringify(items.map((i) => i.url))};
  document.getElementById('copyAll')?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(URLS.join('\\n')); e.target.textContent = '已复制'; }
    catch { e.target.textContent = '复制失败'; }
    setTimeout(() => { e.target.textContent = '复制全部链接'; }, 1600);
  });
  document.getElementById('openAll')?.addEventListener('click', () => {
    if (!confirm('将打开 ' + URLS.length + ' 个新标签页，确定继续？')) return;
    URLS.forEach((u) => window.open(u, '_blank', 'noopener'));
  });
</script>
</body>
</html>
`
}

/** 纯文本分享内容 */
export function renderShareText(payload: SharePayload): string {
  const lines = [payload.title || 'MyTab 分享的标签组', '']
  for (const it of payload.items || []) lines.push(`${it.url} | ${it.title}`)
  return lines.join('\n')
}

/** 链接清单（用于「复制链接」） */
export function linksText(items: Array<Pick<TabItem, 'url'>> = []): string {
  return items.map((it) => it.url).join('\n')
}
