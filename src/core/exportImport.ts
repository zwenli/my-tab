/**
 * 导出 / 导入（与他人、其他工具的互操作）。
 *
 * 说明：在「文件即真相」之后，资料库本身已经是可读文件，**不再需要备份**。
 * 这里保留导出/导入，是为了把清单交给别人、或接收别人给的清单：
 *
 * 1. text —— 人类可读、可粘贴分享的纯文本清单：
 *      [组标题]
 *      https://url | 标题
 * 2. json —— 完整状态快照，用于无损失迁移。
 * 3. html —— Netscape 书签格式，可被浏览器「导入书签」直接读取。
 *
 * 导入时自动识别格式（JSON / HTML 书签 / 纯文本），并做容错解析。
 */
import { SNAPSHOT_FORMAT, SCHEMA_VERSION } from './constants'
import { createGroup, createTabItem, normalizeState } from './model'
import { isCollectableUrl, now, safeParse } from './utils'
import type { ExportKind, Group, ImportResult, MyTabState, Snapshot } from '../types'

/* ------------------------------ 导出 ------------------------------ */

export interface ExportTextOptions {
  includeQuickList?: boolean
  includeNotes?: boolean
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

function fallbackTitle(group: Group): string {
  const d = new Date(group.createdAt || now())
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 状态 → 纯文本清单 */
export function exportToText(state: MyTabState, { includeQuickList = true, includeNotes = true }: ExportTextOptions = {}): string {
  const lines: string[] = []

  for (const g of state.groups ?? []) {
    lines.push(`[${(g.title || '').trim() || fallbackTitle(g)}]`)
    if (includeNotes && g.note) lines.push(`# ${g.note}`)
    for (const it of g.items ?? []) {
      lines.push(`${it.url} | ${(it.title || '').replace(/[\r\n]+/g, ' ')}`)
    }
    lines.push('')
  }

  if (includeQuickList && state.quickList?.length) {
    lines.push('[快捷列表]')
    for (const it of state.quickList) lines.push(`${it.url} | ${(it.title || '').replace(/[\r\n]+/g, ' ')}`)
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

/** 状态 → 完整 JSON 快照对象 */
export function exportToSnapshot(state: MyTabState, deviceId = ''): Snapshot {
  return {
    format: SNAPSHOT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    deviceId: deviceId || state.meta?.deviceId || '',
    exportedAt: now(),
    store: {
      schemaVersion: state.schemaVersion,
      meta: state.meta,
      folders: state.folders,
      groups: state.groups,
      quickList: state.quickList,
      settings: state.settings
    }
  }
}

/** 状态 → HTML 书签格式（可被浏览器直接导入） */
export function exportToHtml(state: MyTabState): string {
  const esc = (s: unknown): string =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const rows: string[] = []
  rows.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  rows.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
  rows.push('<TITLE>MyTab Bookmarks</TITLE>')
  rows.push('<H1>MyTab Bookmarks</H1>')
  rows.push('<DL><p>')

  for (const g of state.groups ?? []) {
    const title = esc((g.title || '').trim() || fallbackTitle(g))
    rows.push(`    <DT><H3 ADD_DATE="${Math.floor((g.createdAt || now()) / 1000)}">${title}</H3>`)
    rows.push('    <DL><p>')
    for (const it of g.items ?? []) {
      rows.push(
        `        <DT><A HREF="${esc(it.url)}" ADD_DATE="${Math.floor((it.createdAt || now()) / 1000)}">${esc(it.title)}</A>`
      )
    }
    rows.push('    </DL><p>')
  }

  rows.push('</DL><p>')
  return rows.join('\n')
}

/* ------------------------------ 导入 ------------------------------ */

/** 解析纯文本清单 → 组数组 */
export function parseText(text = ''): Group[] {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const groups: Group[] = []
  let current: Group | null = null

  const ensure = (): Group => {
    if (!current) {
      current = createGroup({ title: '' })
      groups.push(current)
    }
    return current
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    // [标题]
    const m = line.match(/^\[(.+)\]$/)
    if (m) {
      current = createGroup({ title: m[1]!.trim() })
      groups.push(current)
      continue
    }
    // # 备注
    if (line.startsWith('#') && current) {
      const note = line.replace(/^#\s*/, '')
      current.note = current.note ? `${current.note}\n${note}` : note
      continue
    }

    // url | title  或  title | url
    let url = ''
    let title = ''
    if (line.includes('|')) {
      const [a = '', ...rest] = line.split('|')
      const b = rest.join('|')
      if (/^https?:/i.test(a.trim())) {
        url = a.trim()
        title = b.trim()
      } else if (/^https?:/i.test(b.trim())) {
        url = b.trim()
        title = a.trim()
      }
    } else if (/^https?:\/\//i.test(line)) {
      url = line
    }

    if (!url || !isCollectableUrl(url)) continue
    ensure().items.push(createTabItem({ url, title: title || url }))
  }

  return groups.filter((g) => g.items.length > 0 || g.title)
}

/** 解析浏览器导出的 HTML 书签 → 组数组 */
export function parseHtmlBookmarks(html = ''): Group[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const groups: Group[] = []
  const topDl = doc.querySelector('dl')
  if (!topDl) return groups

  const walk = (dl: Element, group: Group): void => {
    for (const child of Array.from(dl.children)) {
      if (child.tagName === 'DT') {
        const h3 = child.querySelector(':scope > h3')
        const a = child.querySelector(':scope > a')
        if (h3) {
          const sub = createGroup({ title: h3.textContent?.trim() ?? '' })
          groups.push(sub)
          const subDl = child.querySelector(':scope > dl')
          if (subDl) walk(subDl, sub)
        } else if (a) {
          const url = a.getAttribute('href') || ''
          if (isCollectableUrl(url)) {
            group.items.push(createTabItem({ url, title: a.textContent?.trim() || url }))
          }
        }
      } else if (child.tagName === 'DL') {
        walk(child, group)
      }
    }
  }

  const loose = createGroup({ title: '' })
  let looseUsed = false

  for (const child of Array.from(topDl.children)) {
    if (child.tagName !== 'DT') continue
    const h3 = child.querySelector(':scope > h3')
    const a = child.querySelector(':scope > a')
    if (h3) {
      const sub = createGroup({ title: h3.textContent?.trim() ?? '' })
      groups.push(sub)
      const subDl = child.querySelector(':scope > dl')
      if (subDl) walk(subDl, sub)
    } else if (a) {
      const url = a.getAttribute('href') || ''
      if (isCollectableUrl(url)) {
        loose.items.push(createTabItem({ url, title: a.textContent?.trim() || url }))
        looseUsed = true
      }
    }
  }

  if (looseUsed && loose.items.length) groups.unshift(loose)
  return groups.filter((g) => g.items.length > 0 || g.title)
}

/**
 * 通用导入：自动识别格式。
 */
export function importAny(text: string, deviceId = ''): ImportResult {
  const raw = String(text || '').trim()
  if (!raw) return { state: null, groups: [], format: 'empty' }

  // 1) MyTab / 备份 JSON
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const obj = safeParse<Record<string, unknown>>(raw)
    if (obj) {
      const payload = (obj.store as unknown) ?? obj
      const state = normalizeState(payload, deviceId)
      if (state.groups.length || state.folders.length || state.quickList.length) {
        return { state, groups: state.groups, format: 'json' }
      }
    }
  }

  // 2) HTML 书签
  if (/<a\s|<dl|<html/i.test(raw)) {
    try {
      const groups = parseHtmlBookmarks(raw)
      if (groups.length) return { state: null, groups, format: 'html' }
    } catch {
      /* ignore */
    }
  }

  // 3) 纯文本
  const groups = parseText(raw)
  return { state: null, groups, format: groups.length ? 'text' : 'unknown' }
}

/* ------------------------------ 下载 ------------------------------ */

/** 在页面上下文中触发一次文件下载 */
export function downloadFile(filename: string, content: BlobPart, mime = 'application/octet-stream'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const stamp = (ts = now()): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`
}

export const exportNames: Record<ExportKind, () => string> = {
  text: () => `mytab-${stamp()}.txt`,
  json: () => `mytab-${stamp()}.json`,
  html: () => `mytab-bookmarks-${stamp()}.html`
}
