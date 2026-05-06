<script setup>
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'
import { COLS, ROWS, CELL } from '../game/constants.js'
import { createDefaultMap, createEmptyWalls } from '../game/defaultMap.js'
import { saveCustomMap, loadCustomMap, resetToDefault } from '../game/storage.js'
import { TILE_BRICK, TILE_STEEL, TILE_BUSH, isSolidTile, tileClassSuffix } from '../game/tiles.js'
import { loadSkins, saveSkins, fileToDataUrl } from '../game/skinsStorage.js'
import TankSprite from './TankSprite.vue'
import CenterDialog from './CenterDialog.vue'

const emit = defineEmits(['play', 'back'])

const initialMap = loadCustomMap()
const walls = shallowRef(initialMap.walls.map((row) => [...row]))
const enemies = ref(initialMap.enemies.map((e) => ({ r: e.r, c: e.c, type: e.type || 'assault' })))
const playerSpawns = ref((initialMap.playerSpawns || []).map((s) => ({ r: s.r, c: s.c })))

/** @type {import('vue').Ref<'brick'|'steel'|'bush'|'enemyScout'|'enemyAssault'|'enemyHeavy'|'playerSpawn'|'erase'>} */
const tool = ref('brick')

const skins = ref(loadSkins())
const toastOpen = ref(false)
const toastTitle = ref('')
const toastMessage = ref('')
const bgInput = ref(null)
const skinInputPlayer = ref(null)
const skinInputEnemy = ref(null)

/** 编辑区每格像素：随窗口变化，避免地图小画布大 */
const editorCell = ref(CELL)

const palette = [
  { id: 'brick', label: '砖墙', icon: 'brick' },
  { id: 'steel', label: '钢墙', icon: 'steel' },
  { id: 'bush', label: '草丛', icon: 'bush' },
  { id: 'playerSpawn', label: '出生点', icon: 'spawn' },
  { id: 'enemyScout', label: '轻型敌人', icon: 'enemy-scout' },
  { id: 'enemyAssault', label: '突击敌人', icon: 'enemy-assault' },
  { id: 'enemyHeavy', label: '重型敌人', icon: 'enemy-heavy' },
  { id: 'erase', label: '擦除', icon: 'erase' },
]

function updateEditorCell() {
  // 右侧栏固定在右边时，按更保守的可用宽度计算格子，避免高度变大后地图把右栏挤到下方
  const sidebar = 260 // 侧栏宽度 + gap + 边距冗余
  const frameChrome = 90 // editor-page padding + map-panel/frame 内边距冗余
  const byWidth = Math.floor((window.innerWidth - sidebar - frameChrome) / COLS)
  const byHeight = Math.floor((window.innerHeight - 180) / ROWS)
  editorCell.value = Math.max(14, Math.min(32, Math.min(byWidth, byHeight)))
}

const battleWrapStyle = computed(() => {
  const u = skins.value.battlefield
  if (!u) {
    return {
      backgroundImage: 'linear-gradient(185deg, #1e2820, #121a15)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  const mask = Math.max(0, Math.min(0.7, Number(skins.value.battlefieldMask) || 0.22))
  return {
    backgroundImage: `linear-gradient(180deg, rgba(10,14,10,${mask + 0.04}), rgba(10,14,10,${mask})), url(${u})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const gridStyle = computed(() => ({
  '--cell': `${editorCell.value}px`,
  gridTemplateColumns: `repeat(${COLS}, var(--cell))`,
  gridTemplateRows: `repeat(${ROWS}, var(--cell))`,
}))

function enemyIndexAt(r, c) {
  return enemies.value.findIndex((e) => e.r === r && e.c === c)
}

function enemyAt(r, c) {
  return enemies.value.find((e) => e.r === r && e.c === c) || null
}

function isSpawnAt(r, c) {
  return playerSpawns.value.some((s) => s.r === r && s.c === c)
}

function spawnIndexAt(r, c) {
  return playerSpawns.value.findIndex((s) => s.r === r && s.c === c)
}

function enemyTypeForTool(t) {
  if (t === 'enemyScout') return 'scout'
  if (t === 'enemyHeavy') return 'heavy'
  return 'assault'
}

function cellTile(r, c) {
  return walls.value[r]?.[c] ?? 0
}

function onCellClick(r, c) {
  if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return
  const w = walls.value.map((row) => [...row])
  const ei = enemyIndexAt(r, c)
  if (tool.value === 'erase') {
    w[r][c] = 0
    if (ei >= 0) enemies.value = enemies.value.filter((_, i) => i !== ei)
    if (isSpawnAt(r, c)) playerSpawns.value = playerSpawns.value.filter((s) => !(s.r === r && s.c === c))
    walls.value = w
    return
  }
  if (tool.value === 'playerSpawn') {
    if (isSolidTile(w[r][c])) return
    if (ei >= 0) enemies.value = enemies.value.filter((_, i) => i !== ei)
    const si = spawnIndexAt(r, c)
    if (si >= 0) {
      playerSpawns.value = playerSpawns.value.filter((_, i) => i !== si)
    } else {
      playerSpawns.value = [...playerSpawns.value, { r, c }]
    }
    walls.value = w
    return
  }
  if (tool.value === 'enemyScout' || tool.value === 'enemyAssault' || tool.value === 'enemyHeavy') {
    if (isSolidTile(w[r][c])) return
    if (isSpawnAt(r, c)) playerSpawns.value = playerSpawns.value.filter((s) => !(s.r === r && s.c === c))
    const type = enemyTypeForTool(tool.value)
    if (ei >= 0) {
      enemies.value = enemies.value.map((e, i) => (i === ei ? { ...e, type } : e))
    } else {
      enemies.value = [...enemies.value, { r, c, type }]
    }
    walls.value = w
    return
  }
  if (tool.value === 'brick') {
    if (ei >= 0) enemies.value = enemies.value.filter((_, i) => i !== ei)
    if (isSpawnAt(r, c)) playerSpawns.value = playerSpawns.value.filter((s) => !(s.r === r && s.c === c))
    w[r][c] = TILE_BRICK
    walls.value = w
    return
  }
  if (tool.value === 'steel') {
    if (ei >= 0) enemies.value = enemies.value.filter((_, i) => i !== ei)
    if (isSpawnAt(r, c)) playerSpawns.value = playerSpawns.value.filter((s) => !(s.r === r && s.c === c))
    w[r][c] = TILE_STEEL
    walls.value = w
    return
  }
  if (tool.value === 'bush') {
    w[r][c] = TILE_BUSH
    walls.value = w
    return
  }
}

function save() {
  saveCustomMap({ walls: walls.value, playerSpawns: playerSpawns.value, enemies: enemies.value })
}

function loadSaved() {
  const m = loadCustomMap()
  walls.value = m.walls.map((row) => [...row])
  enemies.value = m.enemies.map((e) => ({ r: e.r, c: e.c, type: e.type || 'assault' }))
  playerSpawns.value = (m.playerSpawns || []).map((s) => ({ r: s.r, c: s.c }))
  skins.value = loadSkins()
}

function restoreFactory() {
  resetToDefault()
  const m = createDefaultMap()
  walls.value = m.walls.map((row) => [...row])
  enemies.value = m.enemies.map((e) => ({ r: e.r, c: e.c, type: e.type || 'assault' }))
  playerSpawns.value = (m.playerSpawns || []).map((s) => ({ r: s.r, c: s.c }))
}

function clearInner() {
  const w = createEmptyWalls()
  for (let c = 0; c < COLS; c++) {
    w[0][c] = TILE_STEEL
    w[ROWS - 1][c] = TILE_STEEL
  }
  for (let r = 0; r < ROWS; r++) {
    w[r][0] = TILE_STEEL
    w[r][COLS - 1] = TILE_STEEL
  }
  walls.value = w
  enemies.value = []
  playerSpawns.value = []
}

function playThis() {
  save()
  emit('play')
}

async function onBattleBgFile(e) {
  const f = e.target?.files?.[0]
  if (!f || !f.type.startsWith('image/')) return
  if (f.size > 900_000) showToast('提示', '图片较大（>900KB），建议压缩后再用。')
  try {
    skins.value = { ...skins.value, battlefield: await fileToDataUrl(f) }
    saveSkins(skins.value)
  } catch {
    showToast('错误', '读取图片失败。')
  }
  e.target.value = ''
}

async function onSkinFile(which, e) {
  const f = e.target?.files?.[0]
  if (!f || !f.type.startsWith('image/')) return
  if (f.size > 700_000) showToast('提示', '建议图片小于 700KB。')
  try {
    const url = await fileToDataUrl(f)
    if (which === 'player') skins.value = { ...skins.value, player: url }
    else skins.value = { ...skins.value, enemy: url }
    saveSkins(skins.value)
  } catch {
    showToast('错误', '读取图片失败。')
  }
  e.target.value = ''
}

function clearBattleBg() {
  skins.value = { ...skins.value, battlefield: null }
  saveSkins(skins.value)
}

function clearSkin(which) {
  if (which === 'player') skins.value = { ...skins.value, player: null }
  else skins.value = { ...skins.value, enemy: null }
  saveSkins(skins.value)
}

function pickBattleBg() {
  bgInput.value?.click()
}

function showToast(title, message) {
  toastTitle.value = title
  toastMessage.value = message
  toastOpen.value = true
}
function onMaskInput(v) {
  skins.value = { ...skins.value, battlefieldMask: Number(v) / 100 }
  saveSkins(skins.value)
}
function pickSkin(which) {
  if (which === 'player') skinInputPlayer.value?.click()
  else skinInputEnemy.value?.click()
}

onMounted(() => {
  updateEditorCell()
  window.addEventListener('resize', updateEditorCell)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateEditorCell)
})
</script>

<template>
  <div class="editor-page">
    <CenterDialog
      v-model:open="toastOpen"
      :title="toastTitle"
      :message="toastMessage"
      variant="neutral"
      confirm-text="知道了"
    />

    <header class="top-bar">
      <div>
        <h2>地图工坊</h2>
        <p class="lede">左侧绘制战场网格；右侧切换工具。外缘为固定钢墙。图片资源在「外观」中配置，进入游玩后由 Canvas 实时渲染。</p>
      </div>
      <button type="button" class="ghost" @click="emit('back')">返回首页</button>
    </header>

    <div class="layout">
      <section class="map-panel">
        <div class="map-frame" :style="battleWrapStyle">
          <div class="grid" :style="gridStyle">
            <template v-for="r in ROWS" :key="'row-' + r">
              <button
                v-for="c in COLS"
                :key="'cell-' + r + '-' + c"
                type="button"
                class="cell"
                :class="[
                  't-' + tileClassSuffix(cellTile(r - 1, c - 1)),
                  { edge: r === 1 || r === ROWS || c === 1 || c === COLS },
                ]"
                :disabled="r === 1 || r === ROWS || c === 1 || c === COLS"
                @click="onCellClick(r - 1, c - 1)"
              >
                <span v-if="isSpawnAt(r - 1, c - 1)" class="cell-tank spawn">
                  <TankSprite variant="player" dir="up" :size="Math.round(editorCell * 0.9)" />
                  <i class="spawn-index">{{ spawnIndexAt(r - 1, c - 1) + 1 }}</i>
                </span>
                <span v-if="enemyAt(r - 1, c - 1) && !isSolidTile(cellTile(r - 1, c - 1))" class="cell-tank enemy">
                  <TankSprite variant="enemy" dir="down" :size="Math.round(editorCell * 0.9)" />
                  <i class="enemy-type-badge" :class="'t-' + (enemyAt(r - 1, c - 1)?.type || 'assault')"></i>
                </span>
              </button>
            </template>
          </div>
        </div>
      </section>

      <aside class="sidebar">
        <h3 class="side-title">工具</h3>
        <p class="skin-hint">可放置多个我方出生点（当前前两个用于 P1/P2，后续可扩展），也可指定敌人类型。</p>
        <ul class="palette">
          <li v-for="p in palette" :key="p.id">
            <button
              type="button"
              class="pal-btn"
              :class="{ on: tool === p.id }"
              @click="tool = /** @type {any} */ (p.id)"
            >
              <span class="pal-ico" :data-icon="p.icon" />
              <span class="pal-label">{{ p.label }}</span>
            </button>
          </li>
        </ul>

        <div class="skin-block">
          <h3 class="side-title">外观（地图 / 坦克）</h3>
          <p class="skin-hint">底图用于战场背景；坦克图用于游玩贴图（炮口朝上）。均仅保存在本机。</p>
          <div class="mask-row">
            <span class="mask-label">背景遮罩</span>
            <input
              type="range"
              min="0"
              max="70"
              step="1"
              :value="Math.round((skins.battlefieldMask ?? 0.22) * 100)"
              @input="onMaskInput($event.target.value)"
            />
            <span class="mask-val">{{ Math.round((skins.battlefieldMask ?? 0.22) * 100) }}%</span>
          </div>
          <div class="skin-rows">
            <div class="skin-line">
              <span class="skin-name">地图</span>
              <button type="button" class="btn-xs" @click="pickBattleBg">上传</button>
              <button type="button" class="btn-xs muted" :disabled="!skins.battlefield" @click="clearBattleBg">清</button>
            </div>
            <div class="skin-line">
              <span class="skin-name">我方</span>
              <button type="button" class="btn-xs" @click="pickSkin('player')">上传</button>
              <button type="button" class="btn-xs muted" :disabled="!skins.player" @click="clearSkin('player')">清</button>
            </div>
            <div class="skin-line">
              <span class="skin-name">敌方</span>
              <button type="button" class="btn-xs" @click="pickSkin('enemy')">上传</button>
              <button type="button" class="btn-xs muted" :disabled="!skins.enemy" @click="clearSkin('enemy')">清</button>
            </div>
          </div>
          <input ref="bgInput" type="file" accept="image/*" class="hidden-file" @change="onBattleBgFile" />
          <input ref="skinInputPlayer" type="file" accept="image/*" class="hidden-file" @change="onSkinFile('player', $event)" />
          <input ref="skinInputEnemy" type="file" accept="image/*" class="hidden-file" @change="onSkinFile('enemy', $event)" />
        </div>

        <div class="actions">
          <button type="button" class="primary span2" @click="save">保存地图</button>
          <button type="button" class="accent span2" @click="playThis">保存并玩</button>
          <button type="button" @click="loadSaved">载入</button>
          <button type="button" @click="clearInner">清空内部</button>
          <button type="button" class="span2" @click="restoreFactory">恢复默认图</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.editor-page {
  text-align: left;
  max-width: 1180px;
  margin: 0 auto;
}
.top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  padding: 18px 20px;
  border-radius: var(--radius-lg, 20px);
  background: var(--surface, rgba(18, 26, 22, 0.75));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  box-shadow: var(--shadow, 0 24px 80px rgba(0, 0, 0, 0.55));
}
.top-bar h2 {
  margin: 0 0 6px;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.lede {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted, rgba(232, 240, 234, 0.62));
  max-width: 56ch;
  line-height: 1.45;
}
.ghost {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  color: var(--text, #e8f0ea);
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  align-self: center;
  transition: background 0.15s ease;
}
.ghost:hover {
  background: rgba(255, 255, 255, 0.08);
}

.layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: nowrap;
}

.map-panel {
  flex: 0 0 auto;
  width: fit-content;
  max-width: 100%;
  border-radius: var(--radius-lg, 20px);
  padding: 12px;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  box-shadow: var(--shadow, 0 24px 80px rgba(0, 0, 0, 0.45));
}

.map-frame {
  overflow: auto;
  max-height: min(82vh, 780px);
  border-radius: 14px;
  padding: 6px;
  background-color: rgba(0, 0, 0, 0.12);
  width: fit-content;
  max-width: 100%;
}

.grid {
  display: grid;
  gap: 0;
  width: fit-content;
  height: fit-content;
  background: transparent;
  box-shadow: none;
}

.cell {
  appearance: none;
  border: none;
  padding: 0;
  margin: 0;
  position: relative;
  background: transparent;
  cursor: pointer;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--cell);
  height: var(--cell);
}
.cell:disabled {
  cursor: default;
}

.cell-tank {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}
.cell-tank.enemy {
  z-index: 4;
}
.spawn-index {
  position: absolute;
  left: 1px;
  top: 1px;
  min-width: 10px;
  height: 10px;
  padding: 0 2px;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.85);
  color: #052e1a;
  font-size: 8px;
  line-height: 10px;
  text-align: center;
  font-weight: 700;
  border: 1px solid rgba(0, 0, 0, 0.35);
}
.enemy-type-badge {
  position: absolute;
  right: 1px;
  top: 1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.45);
}
.enemy-type-badge.t-scout {
  background: #fb7185;
}
.enemy-type-badge.t-assault {
  background: #f59e0b;
}
.enemy-type-badge.t-heavy {
  background: #60a5fa;
}

.t-empty {
  background: transparent;
  outline: none;
}
.t-brick {
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.22) 50%, transparent 50%),
    linear-gradient(#7c4e32, #4a2c14);
  background-size: 6px 100%, 100% 100%;
}
.t-steel {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.13) 0%, transparent 42%),
    repeating-linear-gradient(0deg, #454b54, #454b54 3px, #2f343c 3px, #2f343c 6px),
    repeating-linear-gradient(90deg, #454b54, #454b54 3px, #2f343c 3px, #2f343c 6px);
}
.t-bush {
  background: radial-gradient(circle at 30% 30%, rgba(120, 220, 100, 0.38), transparent 55%),
    radial-gradient(circle at 70% 60%, rgba(50, 110, 48, 0.55), transparent 50%), #1a3220;
}
.cell.edge.t-steel {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.cell:hover:not(:disabled) {
  filter: brightness(1.12);
}

.sidebar {
  flex: 0 0 212px;
  width: 212px;
  max-width: 100%;
  border-radius: var(--radius-lg, 20px);
  padding: 14px 14px 16px;
  background: var(--surface, rgba(18, 26, 22, 0.75));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  box-shadow: var(--shadow, 0 24px 80px rgba(0, 0, 0, 0.45));
}

@media (max-width: 1080px) {
  .layout {
    flex-wrap: wrap;
  }
}

.side-title {
  margin: 0 0 8px;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted, rgba(232, 240, 234, 0.62));
  font-weight: 650;
}

.palette {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pal-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 6px;
  border-radius: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  color: var(--text, #e8f0ea);
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 500;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.pal-btn:hover {
  background: rgba(255, 255, 255, 0.07);
}
.pal-btn.on {
  border-color: rgba(52, 211, 153, 0.55);
  background: rgba(52, 211, 153, 0.12);
  font-weight: 700;
}

.pal-ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.pal-ico[data-icon='brick'] {
  background: linear-gradient(#9c6644, #5c3818);
}
.pal-ico[data-icon='steel'] {
  background: repeating-linear-gradient(45deg, #5f6670, #5f6670 3px, #3b424c 3px, #3b424c 6px);
}
.pal-ico[data-icon='bush'] {
  background: radial-gradient(circle at 40% 40%, #7ccf5c, #142818);
}
.pal-ico[data-icon='spawn'] {
  background: linear-gradient(145deg, #34d399, #047857);
}
.pal-ico[data-icon='enemy-scout'] {
  background: linear-gradient(145deg, #fb7185, #9f1239);
}
.pal-ico[data-icon='enemy-assault'] {
  background: linear-gradient(145deg, #f59e0b, #92400e);
}
.pal-ico[data-icon='enemy-heavy'] {
  background: linear-gradient(145deg, #60a5fa, #1d4ed8);
}
.pal-ico[data-icon='erase'] {
  background: linear-gradient(145deg, #94a3b8, #334155);
}

.pal-label {
  line-height: 1.1;
}

.skin-block {
  margin-bottom: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
}
.skin-hint {
  margin: 0 0 8px;
  font-size: 0.7rem;
  color: var(--text-muted, rgba(232, 240, 234, 0.62));
  line-height: 1.35;
}
.mask-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.mask-label,
.mask-val {
  font-size: 0.68rem;
  color: var(--text-muted, rgba(232, 240, 234, 0.62));
  white-space: nowrap;
}
.mask-row input[type='range'] {
  width: 100%;
  accent-color: #34d399;
}
.skin-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.skin-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.76rem;
}
.skin-name {
  flex: 1 1 auto;
  min-width: 2em;
  opacity: 0.92;
}
.btn-xs {
  padding: 5px 10px;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.06);
  color: var(--text, #e8f0ea);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
}
.btn-xs:hover {
  background: rgba(255, 255, 255, 0.1);
}
.btn-xs.muted {
  opacity: 0.75;
}

.hidden-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.actions button {
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.05);
  color: var(--text, #e8f0ea);
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 600;
  transition: background 0.15s ease;
}
.actions button:hover {
  background: rgba(255, 255, 255, 0.1);
}
.actions .span2 {
  grid-column: 1 / -1;
}
.actions .primary {
  background: linear-gradient(145deg, #10b981, #059669);
  color: #041910;
  border-color: rgba(255, 255, 255, 0.2);
}
.actions .accent {
  background: linear-gradient(145deg, #0ea5e9, #0369a1);
  color: #e0f2fe;
  border-color: rgba(255, 255, 255, 0.16);
}
</style>
