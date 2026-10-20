/**
 * 与后台通信的轻量封装。
 */
import { MSG } from '@/core/constants'
import type { OutgoingMessage, MessageResponse, LibraryRescanResponse, LibraryStatusResponse, LibrarySyncResponse } from '@/background/router'
import type { BaseResponse, CollectOptions, CollectResult, StatsResponse } from '@/types'

const hasRuntime = (): boolean => typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage

/** 发送消息并可指定响应类型 */
export function sendMessage<T extends MessageResponse = BaseResponse>(message: OutgoingMessage): Promise<T> {
  if (!hasRuntime()) return Promise.resolve({ ok: false, reason: 'NO_RUNTIME' } as T)
  return new Promise<T>((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res: MessageResponse | undefined) => {
        if (chrome.runtime?.lastError || !res) {
          resolve({ ok: false, reason: chrome.runtime?.lastError?.message ?? 'NO_RESPONSE' } as T)
          return
        }
        resolve(res as T)
      })
    } catch (e) {
      resolve({ ok: false, reason: (e as Error)?.message || 'SEND_FAILED' } as T)
    }
  })
}

export const collectViaBackground = (payload: CollectOptions): Promise<CollectResult> =>
  sendMessage<CollectResult>({ type: MSG.COLLECT, payload })

export const openListViaBackground = (payload: { windowId?: number; search?: string } = {}): Promise<BaseResponse> =>
  sendMessage<BaseResponse>({ type: MSG.OPEN_LIST, payload })

export const getStatsViaBackground = (): Promise<StatsResponse> => sendMessage<StatsResponse>({ type: MSG.GET_STATS })

export const libraryStatusViaBackground = (): Promise<LibraryStatusResponse> =>
  sendMessage<LibraryStatusResponse>({ type: MSG.LIBRARY_STATUS })

export const librarySyncViaBackground = (): Promise<LibrarySyncResponse> =>
  sendMessage<LibrarySyncResponse>({ type: MSG.LIBRARY_SYNC })

export const libraryRescanViaBackground = (): Promise<LibraryRescanResponse> =>
  sendMessage<LibraryRescanResponse>({ type: MSG.LIBRARY_RESCAN })

export function useMessaging(): {
  sendMessage: typeof sendMessage
  collectViaBackground: typeof collectViaBackground
  openListViaBackground: typeof openListViaBackground
  getStatsViaBackground: typeof getStatsViaBackground
  libraryStatusViaBackground: typeof libraryStatusViaBackground
  librarySyncViaBackground: typeof librarySyncViaBackground
  libraryRescanViaBackground: typeof libraryRescanViaBackground
} {
  return {
    sendMessage,
    collectViaBackground,
    openListViaBackground,
    getStatsViaBackground,
    libraryStatusViaBackground,
    librarySyncViaBackground,
    libraryRescanViaBackground
  }
}

export type { OutgoingMessage, MessageResponse }
