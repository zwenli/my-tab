import { describe, expect, it } from 'vitest'
import { buildPayload, linksText, packPayload, renderShareText, renderStandaloneHtml, unpackPayload } from '@/core/share'

describe('分享', () => {
  it('载荷压缩往返一致', async () => {
    const payload = buildPayload({
      title: '测试组',
      items: Array.from({ length: 40 }, (_, i) => ({ url: `https://site${i}.com/page?q=${i}`, title: `第 ${i} 个标签` }))
    })
    const packed = await packPayload(payload)
    const back = await unpackPayload(packed)
    expect(back).toBeTruthy()
    expect(back!.title).toBe('测试组')
    expect(back!.items.length).toBe(40)
    expect(back!.items[3]!.url).toBe(payload.items[3]!.url)
  })

  it('独立分享页包含全部链接且自包含', () => {
    const payload = buildPayload({
      title: 'T',
      items: [{ url: 'https://a.com/?x=1&y=2', title: '<b>A</b>', starred: false }]
    })
    const html = renderStandaloneHtml(payload)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html, 'URL 应被 HTML 转义').toContain('https://a.com/?x=1&amp;y=2')
    expect(html, '标题应被转义，防注入').toContain('&lt;b&gt;A&lt;/b&gt;')
    expect(html, '不应引用外部脚本').not.toMatch(/<script src=/)
  })

  it('纯文本分享与链接清单', () => {
    const payload = buildPayload({
      title: 'T',
      items: [
        { url: 'https://a.com', title: 'A', starred: false },
        { url: 'https://b.com', title: 'B', starred: false }
      ]
    })
    expect(renderShareText(payload).split('\n').length).toBe(4)
    expect(linksText(payload.items)).toBe('https://a.com\nhttps://b.com')
  })
})
