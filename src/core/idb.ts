/**
 * 极简 IndexedDB 封装 —— 仅用于持久化 OneDrive 目录句柄（FileSystemDirectoryHandle）。
 * 句柄无法序列化进 chrome.storage，只能放 IDB。
 */
import { IDB_NAME, IDB_STORE } from './constants'

const hasIDB = (): boolean => typeof indexedDB !== 'undefined'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIDB()) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'))
  })
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value as unknown, key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'))
  })
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
    req.onerror = () => reject(req.error ?? new Error('IDB read failed'))
  })
}

export async function idbDelete(key: string): Promise<boolean> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error ?? new Error('IDB delete failed'))
  })
}
