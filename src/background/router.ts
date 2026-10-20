/**
 * 后台 ↔ 页面消息路由。
 */
import { MSG } from '@/core/constants'
import { computeStats } from '@/core/model'
import { getDeviceId, loadState } from '@/core/storage'
import { openListPage } from '@/core/tabs'
import { flushToLibrary, libraryStatus, rescanLibrary } from './librarySync'
import { collect } from './collect'
import type { BaseResponse, CollectOptions, CollectResult, LibraryStatus, StatsResponse } from '@/types'

/** 页面 → 后台的消息联合类型 */
export type OutgoingMessage =
  | { type: typeof MSG.COLLECT; payload?: CollectOptions }
  | { type: typeof MSG.OPEN_LIST; payload?: { windowId?: number; search?: string } }
  | { type: typeof MSG.GET_STATS }
  | { type: typeof MSG.LIBRARY_STATUS }
  | { type: typeof MSG.LIBRARY_SYNC }
  | { type: typeof MSG.LIBRARY_RESCAN }
  | { type: typeof MSG.STATE_CHANGED }
  | { type: typeof MSG.PING }

export interface LibrarySyncResponse extends BaseResponse {
  written?: number
  trashed?: number
}

export interface LibraryRescanResponse extends BaseResponse {
  groups?: number
  items?: number
  conflicts?: string[]
}

export interface LibraryStatusResponse extends BaseResponse {
  status: LibraryStatus
}

export type MessageResponse =
  | CollectResult
  | StatsResponse
  | LibraryStatusResponse
  | LibrarySyncResponse
  | LibraryRescanResponse
  | BaseResponse
  | { ok: true; pong: true; deviceId: string }

const ok = <T extends object>(data: T = {} as T): { ok: true } & T => ({ ok: true, ...data })
const fail = (reason: string): BaseResponse => ({ ok: false, reason })

type SendResponse = (response: MessageResponse) => void

export async function handleMessage(message: OutgoingMessage, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse): Promise<void> {
  const { type, payload } = message as { type: string; payload?: unknown }

  try {
    switch (type) {
      case MSG.COLLECT: {
        sendResponse(await collect((payload ?? {}) as CollectOptions))
        return
      }
      case MSG.OPEN_LIST: {
        const p = (payload ?? {}) as { windowId?: number; search?: string }
        await openListPage({ windowId: p.windowId, search: p.search ?? '', focus: true })
        sendResponse(ok())
        return
      }
      case MSG.GET_STATS: {
        const state = await loadState()
        sendResponse(ok<Omit<StatsResponse, 'ok'>>({ stats: computeStats(state), updatedAt: state.meta.updatedAt }))
        return
      }
      case MSG.LIBRARY_STATUS: {
        sendResponse(ok<Omit<LibraryStatusResponse, 'ok'>>({ status: await libraryStatus() }))
        return
      }
      case MSG.LIBRARY_SYNC: {
        const res = await flushToLibrary()
        sendResponse(res.ok ? ok({ written: res.written, trashed: res.trashed }) : fail(res.reason ?? 'WRITE_FAILED'))
        return
      }
      case MSG.LIBRARY_RESCAN: {
        const res = await rescanLibrary()
        if (!res.ok) {
          sendResponse(fail(res.reason ?? 'READ_FAILED'))
          return
        }
        sendResponse(ok({ groups: res.groups, items: res.items, conflicts: res.conflicts }))
        return
      }
      case MSG.STATE_CHANGED:
        sendResponse(ok())
        return
      case MSG.PING:
        sendResponse({ ok: true, pong: true, deviceId: await getDeviceId() })
        return
      default:
        sendResponse(fail('UNKNOWN_MESSAGE'))
    }
  } catch (e) {
    sendResponse(fail((e as Error)?.message || 'INTERNAL_ERROR'))
  }
}
