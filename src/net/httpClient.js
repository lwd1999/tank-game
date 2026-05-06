const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4179'

async function request(path, options = {}, token = '') {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw new Error(`无法连接联机服务（${API_BASE}）。请先启动后端：npm run dev:server（或 npm run dev:all）`)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || '请求失败')
  }
  return data
}

export const apiBase = API_BASE

export function register(username, password) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function login(username, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function me(token) {
  return request('/auth/me', {}, token)
}

export function listRooms(token) {
  return request('/rooms', {}, token)
}

export function createRoom(token, activeSlots = 2) {
  return request('/rooms/create', { method: 'POST', body: JSON.stringify({ activeSlots }) }, token)
}

export function matchmake(token) {
  return request('/rooms/matchmake', { method: 'POST', body: JSON.stringify({}) }, token)
}

export function joinRoom(token, roomId) {
  return request(`/rooms/${roomId}/join`, { method: 'POST', body: JSON.stringify({}) }, token)
}

export function leaveRoom(token, roomId) {
  return request(`/rooms/${roomId}/leave`, { method: 'POST', body: JSON.stringify({}) }, token)
}

export function closeRoom(token, roomId) {
  return request(`/rooms/${roomId}/close`, { method: 'POST', body: JSON.stringify({}) }, token)
}

export function getRoom(token, roomId) {
  return request(`/rooms/${roomId}`, {}, token)
}
