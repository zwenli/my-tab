import { describe, expect, it } from 'vitest'
import { isRestorable, libraryAccessLevel } from '@/core/libraryAccess'

describe('资料库访问等级（重启后不该显示「未连接」）', () => {
  it('权限被浏览器重置为 prompt → needs-grant，绑定仍然算在', () => {
    const level = libraryAccessLevel({ supported: true, hasDir: true, permission: 'prompt' })
    expect(level).toBe('needs-grant')
    expect(isRestorable(level), '这种情况只需「恢复访问」，不必重新选文件夹').toBe(true)
  })

  it('没绑过 / 已授权 / 被拒绝 / 不支持 各自分明', () => {
    expect(libraryAccessLevel({ supported: true, hasDir: false, permission: 'none' })).toBe('unbound')
    expect(libraryAccessLevel({ supported: true, hasDir: true, permission: 'granted' })).toBe('ok')
    expect(libraryAccessLevel({ supported: true, hasDir: true, permission: 'denied' })).toBe('denied')
    expect(libraryAccessLevel({ supported: true, hasDir: true, permission: 'error' }), '句柄失效要重新选').toBe(
      'denied'
    )
    expect(libraryAccessLevel({ supported: false, hasDir: true, permission: 'granted' })).toBe('unsupported')
  })

  it('只有 needs-grant 走轻量恢复，其余都不该走', () => {
    const levels = ['unsupported', 'unbound', 'needs-grant', 'denied', 'ok'] as const
    expect(levels.filter((l) => isRestorable(l))).toEqual(['needs-grant'])
  })
})
