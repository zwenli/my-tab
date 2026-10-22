import { describe, expect, it } from 'vitest'
import { defaultGroupTitle, emptyState, normalizeState } from '@/core/model'

describe('数据模型', () => {
  it('emptyState 具备完整结构', () => {
    const s = emptyState('dev-1')
    expect(s.schemaVersion).toBe(1)
    expect(s.meta.deviceId).toBe('dev-1')
    expect(s.groups).toEqual([])
    expect(typeof s.settings.collectPinnedTabs).toBe('boolean')
    expect(s.quickList).toEqual([])
  })

  it('normalizeState 容错并补齐字段', () => {
    const s = normalizeState({ groups: [{ title: 'x', items: [{ url: 'https://a.com' }] }] }, 'dev-x')
    expect(s.groups.length).toBe(1)
    expect(s.groups[0]!.id).toBeTruthy()
    expect(s.groups[0]!.items[0]!.title).toBe('https://a.com')
    expect(s.groups[0]!.items[0]!.starred).toBe(false)
    expect(s.meta.deviceId).toBe('dev-x')
  })

  it('normalizeState 丢弃坏数据', () => {
    const s = normalizeState({ groups: [null, 42, { items: [null, { url: 'https://b.com' }] }] })
    expect(s.groups.length).toBe(1)
    expect(s.groups[0]!.items.length).toBe(1)
  })

  it('normalizeSettings 非法枚举回落到默认值', () => {
    const s = normalizeState({ settings: { theme: 'neon', duplicatePolicy: 3, restoreTarget: 'nowhere' } })
    expect(s.settings.theme).toBe('dark')
    expect(s.settings.duplicatePolicy).toBe('keep')
    expect(s.settings.restoreTarget).toBe('current')
  })

  it('默认组名是精确到秒的时间戳，且不带数量', () => {
    const ts = new Date(2026, 9, 22, 14, 30, 7).getTime()
    expect(defaultGroupTitle(ts)).toBe('2026-10-22 14:30:07')
    expect(defaultGroupTitle(ts)).not.toContain('标签')
    // 同一分钟内连续收起两次也要区分开，否则组名会撞
    expect(defaultGroupTitle(ts)).not.toBe(defaultGroupTitle(ts + 1000))
  })
})
