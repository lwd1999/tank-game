<script setup>
import { onUnmounted, ref, shallowRef } from 'vue'
import MapEditor from './components/MapEditor.vue'
import GamePlay from './components/GamePlay.vue'
import OnlineAuthView from './views/OnlineAuthView.vue'
import OnlineLobbyView from './views/OnlineLobbyView.vue'
import RoomView from './views/RoomView.vue'
import OnlineGamePlay from './components/OnlineGamePlay.vue'
import { createRoom, joinRoom, listRooms, matchmake, me, leaveRoom, closeRoom } from './net/httpClient.js'
import { clearSession, loadSession, saveSession } from './net/session.js'
import { createWsClient } from './net/wsClient.js'

/** @type {import('vue').Ref<'home'|'edit'|'play'|'onlineAuth'|'onlineLobby'|'onlineRoom'|'onlinePlay'>} */
const mode = ref('home')
const session = ref(loadSession())
const rooms = ref([])
const room = ref(null)
const gameState = shallowRef(null)
const wsConnected = ref(false)
const toastText = ref('')
const toastType = ref('ok')
const startCountdown = ref(0)
const pendingEnterPlay = ref(false)
const manualStayInRoom = ref(false)
let toastTimer = 0
let ws = null
let reconnectTimer = 0
let countdownTimer = 0

function goPlay() {
  mode.value = 'play'
}

function handleWs(event, payload) {
  if (event === 'lobby:update') {
    rooms.value = payload?.rooms || []
  } else if (event === 'room:update') {
    room.value = payload?.room || room.value
    if (payload?.room?.status === 'playing') {
      const enteringFromRoom = mode.value === 'onlineRoom'
      if (enteringFromRoom) pendingEnterPlay.value = true
      if (enteringFromRoom && !manualStayInRoom.value) {
        showToast('对局即将开始，等待首帧同步...', 'ok')
      }
    } else {
      pendingEnterPlay.value = false
      manualStayInRoom.value = false
    }
  } else if (event === 'game:state') {
    const next = payload?.state || null
    if (!next) {
      gameState.value = null
    } else {
      const prev = gameState.value || null
      const walls = next.walls || prev?.walls
      let enemies = next.enemies || prev?.enemies || []
      if (!next.enemies && Array.isArray(next.enemyPatch) && prev?.enemies) {
        enemies = prev.enemies.map((e) => ({ ...e }))
        for (const p of next.enemyPatch) {
          if (typeof p?.i !== 'number' || !p?.e) continue
          enemies[p.i] = p.e
        }
      }
      gameState.value = {
        ...(prev || {}),
        ...next,
        walls,
        enemies,
      }
    }
    if (room.value?.status === 'playing' && mode.value !== 'onlinePlay' && pendingEnterPlay.value && !manualStayInRoom.value) {
      mode.value = 'onlinePlay'
      beginStartCountdown()
      pendingEnterPlay.value = false
    }
  } else if (event === 'game:end') {
    gameState.value = payload?.state || null
    clearStartCountdown()
    pendingEnterPlay.value = false
    manualStayInRoom.value = false
    mode.value = 'onlineRoom'
    showToast('本局已结束', 'ok')
  } else if (event === 'error') {
    console.error('[ws-error]', payload)
    showToast(payload?.message || '联机操作失败，请重试', 'error')
  } else if (event === 'room:closed') {
    showToast('房间已被房主解散', 'error')
    room.value = null
    gameState.value = null
    mode.value = 'onlineLobby'
  }
}

function clearStartCountdown() {
  if (countdownTimer) {
    window.clearInterval(countdownTimer)
    countdownTimer = 0
  }
  startCountdown.value = 0
}

function beginStartCountdown() {
  clearStartCountdown()
  startCountdown.value = 3
  countdownTimer = window.setInterval(() => {
    startCountdown.value = Math.max(0, startCountdown.value - 1)
    if (startCountdown.value <= 0) clearStartCountdown()
  }, 1000)
}

function showToast(text, type = 'ok') {
  toastText.value = text
  toastType.value = type
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastText.value = ''
  }, 1800)
}

function connectWs() {
  if (ws || !session.value.token) return
  ws = createWsClient(session.value.token, handleWs, {
    onOpen: () => {
      wsConnected.value = true
      showToast('联机已连接', 'ok')
      if (room.value?.id) ws?.send('room:subscribe', { roomId: room.value.id })
    },
    onClose: () => {
      wsConnected.value = false
      ws = null
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (session.value.token && ['onlineLobby', 'onlineRoom', 'onlinePlay'].includes(mode.value)) {
        reconnectTimer = window.setTimeout(() => {
          connectWs()
        }, 1200)
      }
    },
    onError: () => {
      wsConnected.value = false
      showToast('联机连接异常，正在重试', 'error')
    },
  })
}

function disconnectWs() {
  if (!ws) return
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = 0
  }
  ws.close()
  ws = null
  wsConnected.value = false
}

async function openOnlineEntry() {
  if (!session.value.token) {
    mode.value = 'onlineAuth'
    return
  }
  try {
    const data = await me(session.value.token)
    session.value.user = data.user
    saveSession(session.value.token, data.user)
    connectWs()
    const rs = await listRooms(session.value.token)
    rooms.value = rs.rooms || []
    mode.value = 'onlineLobby'
  } catch {
    console.error('[open-online-entry]')
    clearSession()
    session.value = { token: '', user: null }
    mode.value = 'onlineAuth'
  }
}

async function onAuthed(res) {
  try {
    saveSession(res.token, res.user)
    session.value = { token: res.token, user: res.user }
    connectWs()
    const rs = await listRooms(session.value.token)
    rooms.value = rs.rooms || []
    mode.value = 'onlineLobby'
    showToast('登录成功', 'ok')
  } catch (e) {
    console.error('[on-authed]', e)
    showToast('登录后初始化失败', 'error')
  }
}

async function doCreateRoom() {
  try {
    const res = await createRoom(session.value.token, 2)
    room.value = res.room
    connectWs()
    ws?.send('room:subscribe', { roomId: room.value.id })
    mode.value = 'onlineRoom'
    showToast('房间创建成功', 'ok')
  } catch (e) {
    console.error('[create-room]', e)
    showToast(e?.message || '创建房间失败', 'error')
  }
}

async function doMatchmake() {
  try {
    const res = await matchmake(session.value.token)
    room.value = res.room
    connectWs()
    ws?.send('room:subscribe', { roomId: room.value.id })
    mode.value = 'onlineRoom'
    showToast('匹配成功，已进入房间', 'ok')
  } catch (e) {
    console.error('[matchmake]', e)
    showToast('匹配失败', 'error')
  }
}

async function doJoinRoom(roomId) {
  try {
    const res = await joinRoom(session.value.token, roomId)
    room.value = res.room
    connectWs()
    ws?.send('room:subscribe', { roomId: room.value.id })
    mode.value = 'onlineRoom'
    showToast('已进入房间', 'ok')
  } catch (e) {
    console.error('[join-room]', e)
    showToast('进入房间失败', 'error')
  }
}

async function doLeaveRoom() {
  try {
    if (!room.value) return
    await leaveRoom(session.value.token, room.value.id)
    ws?.send('room:unsubscribe', {})
    room.value = null
    gameState.value = null
    pendingEnterPlay.value = false
    manualStayInRoom.value = false
    clearStartCountdown()
    const rs = await listRooms(session.value.token)
    rooms.value = rs.rooms || []
    showToast('已离开房间', 'ok')
    mode.value = 'onlineLobby'
  } catch (e) {
    console.error('[leave-room]', e)
    showToast('离开房间失败', 'error')
  }
}

async function doCloseRoom() {
  try {
    if (!room.value) return
    await closeRoom(session.value.token, room.value.id)
    ws?.send('room:unsubscribe', {})
    room.value = null
    gameState.value = null
    pendingEnterPlay.value = false
    manualStayInRoom.value = false
    clearStartCountdown()
    const rs = await listRooms(session.value.token)
    rooms.value = rs.rooms || []
    showToast('房间已解散', 'ok')
    mode.value = 'onlineLobby'
  } catch (e) {
    console.error('[close-room]', e)
    showToast('解散房间失败', 'error')
  }
}

function roomAction(type, payload = {}) {
  const ok = ws?.send(type, payload)
  if (!ok) {
    showToast('联机连接未建立，操作未发送', 'error')
    return false
  }
  return true
}

function onRoomReady(ready) {
  if (roomAction('room:ready', { ready })) showToast(ready ? '已准备' : '已取消准备')
}
function onRoomStart() {
  gameState.value = null
  manualStayInRoom.value = false
  pendingEnterPlay.value = true
  if (roomAction('room:start', {})) showToast('正在同步开局状态...', 'ok')
}
function onRoomSyncMap(mapConfig) {
  if (roomAction('room:map', { mapConfig })) showToast('地图已同步到房间')
}
function onRoomKeybinds(keybinds) {
  if (roomAction('room:keybinds', { keybinds })) showToast('键位已保存')
}
function onRoomSkill(skillPayload) {
  if (!skillPayload) return
  const ok = roomAction('room:skill', skillPayload)
  if (!ok) return
  if (skillPayload.unload) showToast('联机技能已卸载', 'ok')
  else showToast('联机技能已同步', 'ok')
}

function doLogoutOnline() {
  disconnectWs()
  clearSession()
  session.value = { token: '', user: null }
  rooms.value = []
  room.value = null
  gameState.value = null
  pendingEnterPlay.value = false
  manualStayInRoom.value = false
  clearStartCountdown()
  mode.value = 'home'
}

function onLeaveOnlinePlay() {
  manualStayInRoom.value = true
  mode.value = 'onlineRoom'
}

function onOnlinePlaySkill(skillPayload) {
  if (!skillPayload) return
  const ok = roomAction('room:skill', skillPayload)
  if (!ok) return
  showToast(skillPayload.unload ? '技能已卸载' : '技能已实时同步', 'ok')
}

onUnmounted(() => {
  clearStartCountdown()
  disconnectWs()
})
</script>

<template>
  <div class="app-root">
    <header v-if="mode === 'home'" class="hero">
      <div class="hero-inner">
        <h1>装甲冲突</h1>
      </div>
    </header>

    <main v-if="mode === 'home'" class="home">
      <div class="card">
        <p class="card-lede">从编辑地图开始，放置砖墙、钢墙、草丛与敌军；保存后即可进入全屏战场。</p>
        <div class="actions">
          <button type="button" class="btn btn-primary" @click="mode = 'edit'">编辑地图</button>
          <button type="button" class="btn btn-secondary" @click="mode = 'play'">单机游玩</button>
          <button type="button" class="btn btn-secondary" @click="openOnlineEntry">联机模式</button>
        </div>
        <p class="fineprint">单机数据保存在本机。联机需要先登录账号。</p>
      </div>
    </main>

    <MapEditor v-else-if="mode === 'edit'" @play="goPlay" @back="mode = 'home'" />
    <GamePlay v-else-if="mode === 'play'" @back="mode = 'home'" @edit="mode = 'edit'" />
    <OnlineAuthView v-else-if="mode === 'onlineAuth'" @authed="onAuthed" @back="mode = 'home'" />
    <OnlineLobbyView
      v-else-if="mode === 'onlineLobby'"
      :rooms="rooms"
      :user="session.user"
      @create="doCreateRoom"
      @match="doMatchmake"
      @join="doJoinRoom"
      @logout="doLogoutOnline"
      @back="mode = 'home'"
    />
    <RoomView
      v-else-if="mode === 'onlineRoom' && room"
      :room="room"
      :user="session.user"
      :connected="wsConnected"
      @leave="doLeaveRoom"
      @ready="onRoomReady"
      @start="onRoomStart"
      @syncMap="onRoomSyncMap"
      @update-keybinds="onRoomKeybinds"
      @update-skill="onRoomSkill"
      @close-room="doCloseRoom"
    />
    <OnlineGamePlay
      v-else-if="mode === 'onlinePlay' && room"
      :room="room"
      :user="session.user"
      :game-state="gameState"
      :connected="wsConnected"
      :paused="startCountdown > 0"
      :send-input="(input) => roomAction('game:input', input)"
      :send-skill="onOnlinePlaySkill"
      @leave="onLeaveOnlinePlay"
    />

    <div v-if="toastText" class="toast" :class="toastType === 'error' ? 'error' : 'ok'">{{ toastText }}</div>
    <div v-if="startCountdown > 0" class="start-mask">
      <div class="start-card">
        <strong>对局即将开始</strong>
        <span>{{ startCountdown }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  padding: 28px 20px 48px;
  max-width: 1080px;
  margin: 0 auto;
}

.hero {
  margin-bottom: 28px;
}
.hero-inner {
  max-width: 46rem;
  display: flex;
  justify-content: center;
}
.eyebrow {
  margin: 0 0 8px;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hero h1 {
  margin: 0 0 10px;
  font-size: clamp(2rem, 5vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  background: linear-gradient(120deg, #ecfdf5, #6ee7b7, #a7f3d0);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tagline {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.55;
  color: var(--text-muted);
  max-width: 42ch;
}

.home {
  display: flex;
  justify-content: center;
}
.card {
  width: min(540px, 100%);
  padding: 28px 26px 22px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
}
.card-lede {
  margin: 0 0 22px;
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(232, 240, 234, 0.88);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.btn {
  padding: 12px 20px;
  border-radius: 14px;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    transform 0.12s ease,
    box-shadow 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;
}
.btn:active {
  transform: translateY(1px);
}
.btn-primary {
  background: linear-gradient(145deg, #10b981, #059669);
  color: #052e1a;
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 30px rgba(16, 185, 129, 0.28);
}
.btn-primary:hover {
  box-shadow: 0 14px 40px rgba(16, 185, 129, 0.38);
}
.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  border-color: var(--border);
}
.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
.fineprint {
  margin: 18px 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.45;
}
.toast {
  position: fixed;
  left: 50%;
  top: 20px;
  transform: translateX(-50%);
  z-index: 20000;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #e8f0ea;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.35);
}
.toast.ok {
  background: rgba(10, 20, 14, 0.94);
}
.toast.error {
  background: rgba(35, 11, 14, 0.95);
  border-color: rgba(248, 113, 113, 0.55);
}
.start-mask {
  position: fixed;
  inset: 0;
  z-index: 19000;
  background: rgba(0, 0, 0, 0.36);
  display: flex;
  align-items: center;
  justify-content: center;
}
.start-card {
  min-width: 220px;
  border-radius: 14px;
  padding: 16px 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(8, 14, 12, 0.92);
  display: grid;
  gap: 8px;
  text-align: center;
}
.start-card strong {
  font-size: 1rem;
}
.start-card span {
  font-size: 2.1rem;
  font-weight: 700;
}
</style>
