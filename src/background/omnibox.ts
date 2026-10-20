/**
 * 地址栏搜索：在地址栏输入关键字 `mt` + 空格，即可检索已保存的标签。
 */
import { omniboxSuggest } from '@/core/search'
import { loadState } from '@/core/storage'
import { openListPage } from '@/core/tabs'

const SEARCH_PREFIX = '__search__:'

const escapeXml = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const stripScheme = (url: string): string => url.replace(/^https?:\/\//i, '')

export function handleInputChanged(text: string, suggest: (suggestResults: chrome.omnibox.SuggestResult[]) => void): void {
  if (!text) {
    suggest([{ content: '', description: '<dim>输入关键词，检索你保存过的标签</dim>' }])
    return
  }

  void loadState()
    .then((state) => {
      const hits = omniboxSuggest(state, text, 6)
      const out: chrome.omnibox.SuggestResult[] = hits.map(({ item }) => ({
        content: item.url,
        description: `${escapeXml(item.title || item.url)} <dim>— ${escapeXml(stripScheme(item.url))}</dim>`
      }))
      out.push({
        content: `${SEARCH_PREFIX}${text}`,
        description: `<match>在 MyTab 中搜索</match> <dim>“${escapeXml(text)}”</dim>`
      })
      suggest(out)
    })
    .catch(() => suggest([]))
}

export function handleInputEntered(text: string, disposition: string): void {
  if (!text) {
    void openListPage({ focus: true })
    return
  }

  if (text.startsWith(SEARCH_PREFIX)) {
    void openListPage({ search: text.slice(SEARCH_PREFIX.length), focus: true })
    return
  }

  if (/^https?:\/\//i.test(text) && typeof chrome !== 'undefined' && chrome.tabs) {
    if (disposition === 'newForegroundTab' || disposition === 'newBackgroundTab') {
      chrome.tabs.create({ url: text, active: disposition !== 'newBackgroundTab' }, () => void chrome.runtime?.lastError)
      return
    }
    chrome.tabs.update({ url: text }, () => void chrome.runtime?.lastError)
    return
  }

  void openListPage({ search: text, focus: true })
}
