import { apiBase } from './httpClient.js'

function toWsBase(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (text.startsWith('ws://') || text.startsWith('wss://')) return text
  if (text.startsWith('http://')) return `ws://${text.slice('http://'.length)}`
  if (text.startsWith('https://')) return `wss://${text.slice('https://'.length)}`
  if (text.startsWith('/')) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}${text}`
  }
  return text
}

function resolveWsBase() {
  const envWs = toWsBase(import.meta.env.VITE_WS_BASE)
  if (envWs) return envWs
  // 不再直接沿用 API_BASE 的路径，避免把 /api 误拼成 /api/ws
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
}

export function createWsClient(token, onEvent, hooks = {}) {
  const base = resolveWsBase().replace(/\/+$/, '')
  const ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}`)
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
