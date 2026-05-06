import jwt from 'jsonwebtoken'
import { WebSocketServer } from 'ws'
import { JWT_SECRET } from '../config.js'
import { currentLobbyRooms, getRoomById, handleRoomAction, removeUserFromRoom, roomView, setPlayerConnected } from './rooms.js'

function safeSend(ws, data) {
  if (ws.readyState !== 1) return
  ws.send(JSON.stringify(data))
}

function parseTokenFromUrl(url) {
  const u = new URL(url, 'http://localhost')
  return u.searchParams.get('token') || ''
}

export function createRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' })
  /** @type {Map<string, Set<WebSocket>>} */
  const userSockets = new Map()
  /** @type {Map<string, Set<WebSocket>>} */
  const roomSockets = new Map()

  function broadcastAll(event, payload) {
    for (const clients of userSockets.values()) {
      for (const ws of clients) safeSend(ws, { event, payload })
    }
  }

  function broadcastRoom(roomId, event, payload) {
    const clients = roomSockets.get(roomId)
    if (!clients) return
    for (const ws of clients) safeSend(ws, { event, payload })
  }

  function attachUserSocket(userId, ws) {
    const set = userSockets.get(userId) || new Set()
    set.add(ws)
    userSockets.set(userId, set)
  }

  function detachUserSocket(userId, ws) {
    const set = userSockets.get(userId)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) userSockets.delete(userId)
  }

  function joinRoomSocket(roomId, ws) {
    const set = roomSockets.get(roomId) || new Set()
    set.add(ws)
    roomSockets.set(roomId, set)
    ws.roomId = roomId
  }

  function leaveRoomSocket(ws) {
    const roomId = ws.roomId
    if (!roomId) return
    const set = roomSockets.get(roomId)
    if (set) {
      set.delete(ws)
      if (set.size === 0) roomSockets.delete(roomId)
    }
    ws.roomId = ''
  }

  wss.on('connection', (ws, req) => {
    const token = parseTokenFromUrl(req.url || '')
    if (!token) {
      ws.close()
      return
    }
    let user = null
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      user = { id: payload.uid, username: payload.username }
    } catch {
      ws.close()
      return
    }
    ws.userId = user.id
    attachUserSocket(user.id, ws)
    safeSend(ws, { event: 'lobby:update', payload: { rooms: currentLobbyRooms() } })

    ws.on('message', (buf) => {
      let message = null
      try {
        message = JSON.parse(String(buf))
      } catch {
        return
      }
      const { type, payload } = message || {}
      if (type === 'room:subscribe') {
        const roomId = String(payload?.roomId || '')
        const room = getRoomById(roomId)
        if (!room) return safeSend(ws, { event: 'error', payload: { message: '房间不存在' } })
        joinRoomSocket(roomId, ws)
        setPlayerConnected(roomId, user.id, true)
        broadcastRoom(roomId, 'room:update', { room: roomView(room) })
        return
      }
      if (type === 'room:unsubscribe') {
        leaveRoomSocket(ws)
        return
      }
      if (!ws.roomId) return
      const result = handleRoomAction(ws.roomId, user, type, payload, broadcastRoom)
      if (result?.error) safeSend(ws, { event: 'error', payload: { message: result.error } })
    })

    ws.on('close', () => {
      const roomId = ws.roomId
      if (roomId) {
        setPlayerConnected(roomId, user.id, false)
        const room = removeUserFromRoom(roomId, user.id)
        if (room) {
          broadcastRoom(roomId, 'room:update', { room: roomView(room) })
        }
        broadcastAll('lobby:update', { rooms: currentLobbyRooms() })
      }
      leaveRoomSocket(ws)
      detachUserSocket(user.id, ws)
    })
  })

  return { broadcastAll, broadcastRoom }
}
