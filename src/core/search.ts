/**
 * 已保存标签的检索（页面内搜索 + 地址栏搜索共用）。
 */
import { hostOf } from './utils'
import type { Group, MyTabState, SearchHit, SearchOptions, TabItem } from '../types'

/** 把查询串切成词元，支持中英文混排 */
export function tokenize(query = ''): string[] {
  return String(query)
    .toLowerCase()
    .split(/[\s,，、|]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * 单条命中打分。
 * `searchInUrl` 关闭时只匹配标题与备注；开启时额外匹配域名与完整 URL。
 */
function scoreItem(item: TabItem, tokens: string[], { searchInUrl = true }: SearchOptions = {}): number {
  if (!tokens.length) return 0
  const title = (item.title || '').toLowerCase()
  const url = (item.url || '').toLowerCase()
  const note = (item.note || '').toLowerCase()
  const host = searchInUrl ? hostOf(item.url).toLowerCase() : ''

  let score = 0
  for (const tk of tokens) {
    let s = 0
    if (title === tk) s += 120
    else if (title.startsWith(tk)) s += 80
    else if (title.includes(tk)) s += 50
    if (note.includes(tk)) s += 35
    if (searchInUrl) {
      if (host === tk) s += 90
      else if (host.includes(tk)) s += 60
      else if (url.includes(tk)) s += 25
    }
    if (s === 0) return 0 // 所有词元都要命中（AND 语义）
    score += s
  }
  // 星标与任务轻微加权
  if (item.starred) score += 6
  if (item.task && !item.task.done) score += 4
  return score
}

/** 在状态中检索条目 */
export function searchItems(state: MyTabState, query: string, options: SearchOptions = {}): SearchHit[] {
  const tokens = tokenize(query)
  const results: SearchHit[] = []

  const push = (item: TabItem, group: Group | null): void => {
    const score = scoreItem(item, tokens, options)
    if (score > 0) results.push({ item, group, score, host: hostOf(item.url) })
  }

  for (const g of state.groups ?? []) {
    for (const item of g.items ?? []) push(item, g)
  }
  for (const item of state.quickList ?? []) push(item, null)

  results.sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
  return results
}

/** 供地址栏建议使用的精简结果 */
export function omniboxSuggest(state: MyTabState, query: string, limit = 6): SearchHit[] {
  return searchItems(state, query).slice(0, limit)
}

/** 组级检索：标题 / 备注 / 组内域名命中 */
export function searchGroups(state: MyTabState, query: string): Group[] {
  const tokens = tokenize(query)
  if (!tokens.length) return state.groups ?? []
  return (state.groups ?? []).filter((g) => {
    const hay = `${g.title || ''} ${g.note || ''} ${(g.items || []).map((i) => `${i.title} ${i.url}`).join(' ')}`.toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}
