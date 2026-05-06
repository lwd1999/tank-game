import { apiBase } from './httpClient.js'

const WS_BASE = (import.meta.env.VITE_WS_BASE || apiBase).replace(/^http/, 'ws')

export function createWsClient(token, onEvent, hooks = {}) {
  const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`)
  ws.onopen = () => hooks.onOpen?.()
  ws.onclose = () => hooks.onClose?.()
  ws.onerror = () => hooks.onError?.()
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onEvent?.(data.event, data.payload)
    } catch {
      /* ignore */
    }
  }
  return {
    ws,
    send(type, payload = {}) {
      if (ws.readyState !== 1) return false
      ws.send(JSON.stringify({ type, payload }))
      return true
    },
    close() {
      ws.close()
    },
  }
}
