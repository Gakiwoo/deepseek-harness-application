/** Sandboxed preload: the renderer's only privileged surface is the IPC fetch bridge. */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopFetchWireChunk, DesktopFetchWireEnd, DesktopFetchWireError,
  DesktopFetchWireRequest, DesktopFetchWireResponse,
} from '@deepseek-ai/dsh-client-connection/client/desktop-bridge'

type Listener<T> = (message: T) => void

function bind<T>(channel: string, listener: Listener<T>): () => void {
  const wrapped = (_event: unknown, message: T): void => { listener(message) }
  ipcRenderer.on(channel, wrapped)
  return () => { ipcRenderer.removeListener(channel, wrapped) }
}

contextBridge.exposeInMainWorld('__DSH_DESKTOP__', {
  request: (message: DesktopFetchWireRequest): Promise<void> =>
    ipcRenderer.invoke('dsh-fetch/request', message) as Promise<void>,
  abort: (id: string): void => { void ipcRenderer.invoke('dsh-fetch/abort', { id }) },
  onResponse: (listener: Listener<DesktopFetchWireResponse>) => bind('dsh-fetch/response', listener),
  onChunk: (listener: Listener<DesktopFetchWireChunk>) => bind('dsh-fetch/chunk', listener),
  onEnd: (listener: Listener<DesktopFetchWireEnd>) => bind('dsh-fetch/end', listener),
  onError: (listener: Listener<DesktopFetchWireError>) => bind('dsh-fetch/error', listener),
})
