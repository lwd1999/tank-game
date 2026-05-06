<script setup>
import { computed, ref, watch } from 'vue'
import KeybindPanel from '../components/KeybindPanel.vue'
import RoomRoster from '../components/RoomRoster.vue'
import CenterDialog from '../components/CenterDialog.vue'
import RoomMapEditor from '../components/RoomMapEditor.vue'
import { COLS, ROWS } from '../game/constants.js'
import { tileClassSuffix } from '../game/tiles.js'

const props = defineProps({
  room: { type: Object, required: true },
  user: { type: Object, required: true },
  connected: { type: Boolean, default: false },
})
const emit = defineEmits(['leave', 'ready', 'start', 'syncMap', 'updateKeybinds', 'play', 'closeRoom'])

const mapEditOpen = ref(false)
const draftMap = ref({ walls: [], enemies: [], playerSpawns: [] })

watch(
  () => props.room.mapConfig,
  (m) => {
    draftMap.value = {
      walls: (m?.walls || []).map((r) => [...r]),
      enemies: (m?.enemies || []).map((e) => ({ ...e })),
      playerSpawns: (m?.playerSpawns || []).map((s) => ({ ...s })),
    }
  },
  { immediate: true, deep: true },
)

function mePlayer() {
  return props.room.players.find((p) => p.userId === props.user.id) || null
}
function amOwner() {
  return props.room.ownerId === props.user.id
}

const canStart = computed(() => amOwner() && props.room.players.length >= 1 && props.room.players.every((p) => p.ready))
const startHint = computed(() => {
  if (!props.connected) return '联机连接断开，请确认后端在线并重进房间'
  if (!amOwner()) return '仅房主可开始游戏'
  if (props.room.players.length < 1) return '至少需要 1 名上场玩家'
  if (!mePlayer()) return '你在观战席，无法开始'
  if (!props.room.players.every((p) => p.ready)) return '仍有上场玩家未准备'
  return '可开始游戏'
})
const ownerName = computed(() => {
  const p = props.room.players.find((x) => x.userId === props.room.ownerId)
  const s = props.room.spectators.find((x) => x.userId === props.room.ownerId)
  return p?.username || s?.username || '未知'
})

const previewCells = computed(() => {
  const out = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out.push({ r, c, key: `${r}-${c}` })
  return out
})
const previewStyle = computed(() => ({
  gridTemplateColumns: `repeat(${COLS}, 10px)`,
  gridTemplateRows: `repeat(${ROWS}, 10px)`,
}))
function hasSpawn(r, c) {
  return props.room.mapConfig?.playerSpawns?.some((s) => s.r === r && s.c === c)
}
function hasEnemy(r, c) {
  return props.room.mapConfig?.enemies?.some((e) => e.r === r && e.c === c)
}
</script>

<template>
  <section class="room">
    <CenterDialog
      v-model:open="mapEditOpen"
      title="房间地图编辑"
      message="仅房主可编辑。点击“应用到房间”后会立即同步给所有玩家。"
      confirm-text="完成"
      size="wide"
      variant="neutral"
    >
      <RoomMapEditor :model-value="draftMap" @update:model-value="emit('syncMap', $event)" />
    </CenterDialog>

    <header class="top">
      <div>
        <h2>房间 {{ room.code }}</h2>
        <p>状态：{{ room.status }} · 房主：{{ room.ownerId === user.id ? '我' : ownerName }} · {{ connected ? '已连接' : '连接中断' }}</p>
      </div>
      <div class="actions">
        <button type="button" @click="emit('leave')">离开</button>
        <button v-if="amOwner()" type="button" class="danger" @click="emit('closeRoom')">解散房间</button>
        <button v-if="room.status === 'playing'" type="button" class="primary" @click="emit('play')">进入对战</button>
      </div>
    </header>

    <RoomRoster :room="room" :self-id="user.id" />

    <section class="panel">
      <div class="preview-head">
        <h3>地图预览</h3>
        <button v-if="amOwner()" type="button" :disabled="!connected" @click="mapEditOpen = true">编辑地图</button>
      </div>
      <div class="preview-grid" :style="previewStyle">
        <i
          v-for="cell in previewCells"
          :key="cell.key"
          class="pv-cell"
          :class="'t-' + tileClassSuffix(room.mapConfig?.walls?.[cell.r]?.[cell.c] || 0)"
        >
          <b v-if="hasSpawn(cell.r, cell.c)" class="pv-spawn" />
          <b v-else-if="hasEnemy(cell.r, cell.c)" class="pv-enemy" />
        </i>
      </div>
    </section>

    <section class="panel">
      <h3>我的键位</h3>
      <p v-if="!mePlayer()">观战身份不可操作，仅可观看。</p>
      <KeybindPanel
        v-else
        :model-value="mePlayer().keybinds"
        @update:model-value="emit('updateKeybinds', $event)"
      />
    </section>

    <section class="panel row">
      <button v-if="mePlayer()" type="button" :disabled="!connected" @click="emit('ready', !mePlayer().ready)">
        {{ mePlayer().ready ? '取消准备' : '准备' }}
      </button>
      <button
        v-if="amOwner()"
        type="button"
        class="primary"
        :disabled="!canStart || !connected"
        @click="emit('start')"
      >
        开始游戏
      </button>
      <span class="hint">{{ startHint }}</span>
    </section>
  </section>
</template>

<style scoped>
.room {
  display: grid;
  gap: 14px;
}
.top,
.actions,
.row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.top {
  justify-content: space-between;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 14px 16px;
  background:
    radial-gradient(120% 110% at 8% 0%, rgba(52, 211, 153, 0.14), transparent 48%),
    rgba(16, 21, 19, 0.74);
}
.panel {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(12, 18, 16, 0.76);
  padding: 12px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
}
button {
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  padding: 8px 10px;
}
.primary {
  background: linear-gradient(145deg, #10b981, #059669);
  color: #052e1a;
}
.danger {
  background: linear-gradient(145deg, #ef4444, #b91c1c);
  color: #fee2e2;
}
.hint {
  margin-left: auto;
  font-size: 0.84rem;
  color: rgba(232, 240, 234, 0.78);
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.preview-grid {
  display: grid;
  gap: 0;
  width: fit-content;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  overflow: hidden;
}
.pv-cell {
  width: 10px;
  height: 10px;
  display: inline-block;
  background: transparent;
  position: relative;
}
.pv-cell.t-brick {
  background: #7c4e32;
}
.pv-cell.t-steel {
  background: #47505b;
}
.pv-cell.t-bush {
  background: #2f6f36;
}
.pv-spawn,
.pv-enemy {
  position: absolute;
  inset: 2px;
  border-radius: 50%;
}
.pv-spawn {
  background: #34d399;
}
.pv-enemy {
  background: #f87171;
}
</style>
