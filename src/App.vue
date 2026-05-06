<script setup>
import { onUnmounted, ref } from 'vue'
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
const gameState = ref(null)
const onlineError = ref('')
const wsConnected = ref(false)
const toastText = ref('')
let toastTimer = 0
let ws = null

function goPlay() {
  mode.value = 'play'
}

function handleWs(event, payload) {
  if (event === 'lobby:update') {
    rooms.value = payload?.rooms || []
  } else if (event === 'room:update') {
    room.value = payload?.room || room.value
  } else if (event === 'game:state') {
    gameState.value = payload?.state || null
  } else if (event === 'game:end') {
    gameState.value = payload?.state || null
    mode.value = 'onlineRoom'
  } else if (event === 'error') {
    onlineError.value = payload?.message || '联机错误'
  } else if (event === 'room:closed') {
    showToast('房间已被房主解散')
    room.value = null
    gameState.value = null
    mode.value = 'onlineLobby'
  }
}

function showToast(text) {
  toastText.value = text
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
      onlineError.value = ''
      if (room.value?.id) ws?.send('room:subscribe', { roomId: room.value.id })
    },
    onClose: () => {
      wsConnected.value = false
    },
    onError: () => {
      wsConnected.value = false
    },
  })
}

function disconnectWs() {
  if (!ws) return
  ws.close()
  ws = null
  wsConnected.value = false
}

async function openOnlineEntry() {
  onlineError.value = ''
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
  } catch (e) {
    onlineError.value = e.message || '登录后初始化失败'
  }
}

async function doCreateRoom() {
  try {
    const res = await createRoom(session.value.token, 2)
    room.value = res.room
    connectWs()
    ws?.send('room:subscribe', { roomId: room.value.id })
    mode.value = 'onlineRoom'
  } catch (e) {
    onlineError.value = e.message || '创建房间失败'
  }
}

async function doMatchmake() {
  try {
    const res = await matchmake(session.value.token)
    room.value = res.room
    connectWs()
    ws?.send('room:subscribe', { roomId: room.value.id })
    mode.value = 'onlineRoom'
  } catch (e) {
    onlineError.value = e.message || '匹配失败'
  }
}

async function doJoinRoom(roomId) {
  try {
    const res = await joinRoom(session.value.token, roomId)
    room.value = res.room
    connectWs()
    ws?.send('room:subscribe', { roomId: room.value.id })
    mode.value = 'onlineRoom'
  } catch (e) {
    onlineError.value = e.message || '进入房间失败'
  }
}

async function doLeaveRoom() {
  try {
    if (!room.value) return
    await leaveRoom(session.value.token, room.value.id)
    ws?.send('room:unsubscribe', {})
    room.value = null
    gameState.value = null
    const rs = await listRooms(session.value.token)
    rooms.value = rs.rooms || []
    showToast('已离开房间')
    mode.value = 'onlineLobby'
  } catch (e) {
    onlineError.value = e.message || '离开房间失败'
  }
}

async function doCloseRoom() {
  try {
    if (!room.value) return
    await closeRoom(session.value.token, room.value.id)
    ws?.send('room:unsubscribe', {})
    room.value = null
    gameState.value = null
    const rs = await listRooms(session.value.token)
    rooms.value = rs.rooms || []
    showToast('房间已解散')
    mode.value = 'onlineLobby'
  } catch (e) {
    onlineError.value = e.message || '解散房间失败'
  }
}

function roomAction(type, payload = {}) {
  const ok = ws?.send(type, payload)
  if (!ok) {
    onlineError.value = '联机连接未建立，操作未发送。请确认已启动后端并重进房间。'
    return false
  }
  return true
}

function onRoomReady(ready) {
  if (roomAction('room:ready', { ready })) showToast(ready ? '已准备' : '已取消准备')
}
function onRoomStart() {
  if (roomAction('room:start', {})) showToast('已发送开始请求')
}
function onRoomSyncMap(mapConfig) {
  if (roomAction('room:map', { mapConfig })) showToast('地图已同步到房间')
}
function onRoomKeybinds(keybinds) {
  if (roomAction('room:keybinds', { keybinds })) showToast('键位已保存')
}

function doLogoutOnline() {
  disconnectWs()
  clearSession()
  session.value = { token: '', user: null }
  rooms.value = []
  room.value = null
  gameState.value = null
  mode.value = 'home'
}

onUnmounted(() => {
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
      @close-room="doCloseRoom"
      @play="mode = 'onlinePlay'"
    />
    <OnlineGamePlay
      v-else-if="mode === 'onlinePlay' && room && gameState"
      :room="room"
      :user="session.user"
      :game-state="gameState"
      :connected="wsConnected"
      :send-input="(input) => roomAction('game:input', input)"
      @leave="mode = 'onlineRoom'"
    />

    <p v-if="onlineError" class="online-error">{{ onlineError }}</p>
    <div v-if="toastText" class="toast">{{ toastText }}</div>
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
.online-error {
  margin-top: 10px;
  color: #fb7185;
  text-align: center;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 20000;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 16, 14, 0.92);
  color: #e8f0ea;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.35);
}
</style>
