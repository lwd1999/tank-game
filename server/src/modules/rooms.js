import { v4 as uuidv4 } from 'uuid'
import { createDefaultMap } from '../../../src/game/defaultMap.js'
import { ACTIVE_SLOTS_DEFAULT } from '../config.js'
import { createGameSession } from './gameLoop.js'

const rooms = new Map()

function roomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function defaultKeybinds() {
  return {
    up: 'w',
    down: 's',
    left: 'a',
    right: 'd',
    fire: 'Space',
    toggleWeapon: 'q',
    skill: 'e',
  }
}

export function roomView(room) {
  return {
    id: room.id,
    code: room.code,
    ownerId: room.ownerId,
    status: room.status,
    activeSlots: room.activeSlots,
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      slot: p.slot,
      ready: p.ready,
      keybinds: p.keybinds,
      connected: p.connected,
    })),
    spectators: room.spectators.map((s) => ({ userId: s.userId, username: s.username })),
    mapConfig: room.mapConfig,
  }
}

function findParticipant(room, userId) {
  const player = room.players.find((p) => p.userId === userId)
  if (player) return { role: 'player', data: player }
  const spectator = room.spectators.find((s) => s.userId === userId)
  if (spectator) return { role: 'spectator', data: spectator }
  return null
}

function joinRoom(room, user) {
  const existing = findParticipant(room, user.id)
  if (existing) return existing
  if (room.players.length < room.activeSlots) {
    const player = {
      userId: user.id,
      username: user.username,
      slot: room.players.length,
      ready: false,
      keybinds: defaultKeybinds(),
      connected: true,
    }
    room.players.push(player)
    return { role: 'player', data: player }
  }
  const spectator = { userId: user.id, username: user.username }
  room.spectators.push(spectator)
  return { role: 'spectator', data: spectator }
}

export function getRoomById(roomId) {
  return rooms.get(roomId) || null
}

export function removeUserFromRoom(roomId, userId) {
  const room = rooms.get(roomId)
  if (!room) return null
  room.players = room.players.filter((p) => p.userId !== userId)
  room.spectators = room.spectators.filter((s) => s.userId !== userId)
  room.players.forEach((p, i) => {
    p.slot = i
  })
  if (room.ownerId === userId) {
    room.ownerId = room.players[0]?.userId || room.spectators[0]?.userId || null
  }
  if (room.players.length === 0 && room.spectators.length === 0) {
    room.session?.stop()
    rooms.delete(roomId)
    return null
  }
  return room
}

export function setPlayerConnected(roomId, userId, connected) {
  const room = rooms.get(roomId)
  if (!room) return
  const p = room.players.find((x) => x.userId === userId)
  if (p) p.connected = connected
}

export function mountRoomRoutes(app, authRequired, broadcastRoom, broadcastAll) {
  function createRoomForUser(user, activeSlots = ACTIVE_SLOTS_DEFAULT) {
    const room = {
      id: uuidv4(),
      code: roomCode(),
      ownerId: user.id,
      status: 'waiting',
      activeSlots: Math.max(2, Number(activeSlots || ACTIVE_SLOTS_DEFAULT)),
      players: [],
      spectators: [],
      mapConfig: createDefaultMap(),
      session: null,
    }
    joinRoom(room, user)
    rooms.set(room.id, room)
    return room
  }

  app.get('/rooms', authRequired, (_req, res) => {
    const list = Array.from(rooms.values()).map(roomView)
    res.json({ rooms: list })
  })

  app.post('/rooms/create', authRequired, (req, res) => {
    const room = createRoomForUser(req.user, req.body?.activeSlots)
    broadcastAll('lobby:update', { rooms: Array.from(rooms.values()).map(roomView) })
    res.json({ room: roomView(room) })
  })

  app.post('/rooms/matchmake', authRequired, (req, res) => {
    const waiting = Array.from(rooms.values()).find((r) => r.status === 'waiting' && r.players.length < r.activeSlots)
    if (waiting) {
      joinRoom(waiting, req.user)
      broadcastRoom(waiting.id, 'room:update', { room: roomView(waiting) })
      return res.json({ room: roomView(waiting) })
    }
    const room = createRoomForUser(req.user, ACTIVE_SLOTS_DEFAULT)
    broadcastAll('lobby:update', { rooms: Array.from(rooms.values()).map(roomView) })
    return res.json({ room: roomView(room) })
  })

  app.post('/rooms/:roomId/join', authRequired, (req, res) => {
    const room = rooms.get(req.params.roomId)
    if (!room) return res.status(404).json({ error: '房间不存在' })
    joinRoom(room, req.user)
    broadcastRoom(room.id, 'room:update', { room: roomView(room) })
    broadcastAll('lobby:update', { rooms: Array.from(rooms.values()).map(roomView) })
    res.json({ room: roomView(room) })
  })

  app.post('/rooms/:roomId/leave', authRequired, (req, res) => {
    const room = removeUserFromRoom(req.params.roomId, req.user.id)
    if (room) {
      broadcastRoom(room.id, 'room:update', { room: roomView(room) })
    }
    broadcastAll('lobby:update', { rooms: Array.from(rooms.values()).map(roomView) })
    res.json({ ok: true })
  })

  app.post('/rooms/:roomId/close', authRequired, (req, res) => {
    const room = rooms.get(req.params.roomId)
    if (!room) return res.status(404).json({ error: '房间不存在或已解散' })
    if (room.ownerId !== req.user.id) return res.status(403).json({ error: '仅房主可解散房间' })
    room.session?.stop()
    rooms.delete(room.id)
    broadcastRoom(room.id, 'room:closed', { roomId: room.id })
    broadcastAll('lobby:update', { rooms: Array.from(rooms.values()).map(roomView) })
    res.json({ ok: true })
  })

  app.get('/rooms/:roomId', authRequired, (req, res) => {
    const room = rooms.get(req.params.roomId)
    if (!room) return res.status(404).json({ error: '房间不存在' })
    res.json({ room: roomView(room) })
  })
}

export function handleRoomAction(roomId, user, type, payload, emitRoom) {
  const room = rooms.get(roomId)
  if (!room) return { error: '房间不存在' }
  const actor = findParticipant(room, user.id)
  if (!actor) return { error: '不在房间内' }

  if (type === 'room:ready' && actor.role === 'player') {
    actor.data.ready = !!payload?.ready
  }
  if (type === 'room:keybinds' && actor.role === 'player') {
    actor.data.keybinds = { ...actor.data.keybinds, ...(payload?.keybinds || {}) }
  }
  if (type === 'room:map' && user.id === room.ownerId) {
    room.mapConfig = payload?.mapConfig || room.mapConfig
  }
  if (type === 'room:start') {
    const canStart =
      user.id === room.ownerId &&
      room.players.length >= 1 &&
      room.players.every((p) => p.ready === true)
    if (!canStart) return { error: '未满足开局条件' }
    room.status = 'playing'
    room.session?.stop()
    room.session = createGameSession(room, (event, data) => {
      emitRoom(room.id, event, data)
      if (event === 'game:end') {
        emitRoom(room.id, 'room:update', { room: roomView(room) })
      }
    })
    room.session.start()
  }
  if (type === 'game:input' && actor.role === 'player' && room.status === 'playing' && room.session) {
    room.session.setInput(actor.data.slot, payload || {})
    return { ok: true }
  }

  emitRoom(room.id, 'room:update', { room: roomView(room) })
  return { ok: true, room: roomView(room) }
}

export function currentLobbyRooms() {
  return Array.from(rooms.values()).map(roomView)
}
