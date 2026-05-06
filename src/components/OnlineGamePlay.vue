<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { COLS, ROWS, CELL } from '../game/constants.js'
import { drawBattlefield } from '../game/renderBattleCanvas.js'
import { loadSkins } from '../game/skinsStorage.js'
import { SKILL_CODE_TEMPLATE, SKILL_PRESETS } from '../game/customSkillPresets.js'
import OnlineStatusBar from './OnlineStatusBar.vue'

const props = defineProps({
  room: { type: Object, required: true },
  user: { type: Object, required: true },
  gameState: { type: Object, default: null },
  connected: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  sendInput: { type: Function, required: true },
  sendSkill: { type: Function, default: null },
})

const emit = defineEmits(['leave'])
const canvasRef = ref(null)
const skins = ref(loadSkins())
const battleImages = { bg: null, player: null, enemy: null }
let canvasCtx = null
let inputTimer = 0
let lastSentInputSig = ''
const pressed = ref(new Set())
const oneShot = ref({ toggleWeapon: false, useSkill: false })
const cursorCell = ref(null)
const skillOpen = ref(false)
const skillPreset = ref('none')
const skillName = ref('联机实时技能')
const skillCooldown = ref(2600)
const skillSource = ref(SKILL_CODE_TEMPLATE)
const skillHint = ref('可在对局中实时同步技能代码')

const mePlayer = computed(() => props.room.players.find((p) => p.userId === props.user.id) || null)
const mySkillConfig = computed(() => mePlayer.value?.skillConfig || null)

function normalizeKey(key) {
  if (key === ' ') return 'Space'
  return key
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function syncImages() {
  const s = skins.value
  const [bg, player, enemy] = await Promise.all([loadImage(s.battlefield), loadImage(s.player), loadImage(s.enemy)])
  battleImages.bg = bg
  battleImages.player = player
  battleImages.enemy = enemy
  paint()
}

function currentInput() {
  const me = mePlayer.value
  if (!me) return { turn: null, move: false, fire: false, toggleWeapon: false, useSkill: false, cursor: null }
  const kb = me.keybinds || {}
  const has = (k) => pressed.value.has(k)
  const up = has(kb.up)
  const down = has(kb.down)
  const left = has(kb.left)
  const right = has(kb.right)
  let turn = null
  if (up) turn = 'up'
  else if (down) turn = 'down'
  else if (left) turn = 'left'
  else if (right) turn = 'right'
  return {
    turn,
    move: up || down || left || right,
    fire: has(kb.fire),
    toggleWeapon: oneShot.value.toggleWeapon,
    useSkill: oneShot.value.useSkill,
    cursor: cursorCell.value,
  }
}

function inputSignature(input) {
  const c = input.cursor ? `${input.cursor.r},${input.cursor.c}` : '-'
  return `${input.turn || '-'}|${input.move ? 1 : 0}|${input.fire ? 1 : 0}|${input.toggleWeapon ? 1 : 0}|${input.useSkill ? 1 : 0}|${c}`
}

function flushInput() {
  if (!props.connected) return
  if (!mePlayer.value) return
  const next = currentInput()
  const sig = inputSignature(next)
  if (sig !== lastSentInputSig) {
    props.sendInput(next)
    lastSentInputSig = sig
  }
  oneShot.value.toggleWeapon = false
  oneShot.value.useSkill = false
}

function isEditableTarget(target) {
  const el = target instanceof HTMLElement ? target : null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onDown(e) {
  const me = mePlayer.value
  if (!me) return
  if (isEditableTarget(e.target)) return
  const key = normalizeKey(e.key)
  const kb = me.keybinds || {}
  const isGameKey = key === kb.up || key === kb.down || key === kb.left || key === kb.right || key === kb.fire || key === kb.toggleWeapon || key === kb.skill
  if (!isGameKey) return
  pressed.value.add(key)
  if (key === me.keybinds?.toggleWeapon && !e.repeat) oneShot.value.toggleWeapon = true
  if (key === me.keybinds?.skill && !e.repeat) oneShot.value.useSkill = true
  e.preventDefault()
}

function onUp(e) {
  if (isEditableTarget(e.target)) return
  pressed.value.delete(normalizeKey(e.key))
}

function updateCursorFromEvent(e) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const c = Math.floor(x / CELL)
  const r = Math.floor(y / CELL)
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
    cursorCell.value = null
    return
  }
  cursorCell.value = { r, c }
}

function clearCursorCell() {
  cursorCell.value = null
}

function loadPreset() {
  const p = SKILL_PRESETS.find((x) => x.id === skillPreset.value)
  if (!p) return
  skillName.value = p.name
  skillCooldown.value = p.cooldownMs
  skillSource.value = p.source
  skillHint.value = `已载入预设：${p.label}`
}

function syncSkill() {
  if (!mePlayer.value) return
  props.sendSkill?.({
    name: skillName.value,
    cooldownMs: skillCooldown.value,
    source: skillSource.value,
    unload: false,
  })
  skillHint.value = '技能已发送，服务端编译成功后立即生效'
}

function unloadSkill() {
  if (!mePlayer.value) return
  props.sendSkill?.({ unload: true })
  skillHint.value = '技能卸载请求已发送'
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const cssW = COLS * CELL
  const cssH = ROWS * CELL
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvasCtx = canvas.getContext('2d', { alpha: false })
  if (!canvasCtx) return
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function paint() {
  if (!canvasCtx || !props.gameState) return
  drawBattlefield(canvasCtx, props.gameState, {
    cell: CELL,
    cols: COLS,
    rows: ROWS,
    bg: battleImages.bg,
    player: battleImages.player,
    enemy: battleImages.enemy,
    bgMask: skins.value.battlefieldMask,
  })
}

watch(
  () => props.gameState,
  () => paint(),
)

watch(
  () => mySkillConfig.value,
  (cfg) => {
    if (!cfg) return
    skillName.value = cfg.name || skillName.value
    skillCooldown.value = Number.isFinite(Number(cfg.cooldownMs)) ? Number(cfg.cooldownMs) : skillCooldown.value
    skillSource.value = cfg.source || skillSource.value
  },
  { immediate: true },
)

onMounted(() => {
  lastSentInputSig = ''
  resizeCanvas()
  syncImages()
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  canvasRef.value?.addEventListener('mousemove', updateCursorFromEvent)
  canvasRef.value?.addEventListener('mouseleave', clearCursorCell)
  inputTimer = window.setInterval(flushInput, 50)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onDown)
  window.removeEventListener('keyup', onUp)
  canvasRef.value?.removeEventListener('mousemove', updateCursorFromEvent)
  canvasRef.value?.removeEventListener('mouseleave', clearCursorCell)
  window.clearInterval(inputTimer)
})
</script>

<template>
  <section class="online-play">
    <header class="top">
      <h2>联机战场</h2>
      <div class="actions">
        <button type="button" @click="skillOpen = !skillOpen">{{ skillOpen ? '关闭技能面板' : '实时技能' }}</button>
        <button type="button" @click="emit('leave')">返回房间</button>
      </div>
    </header>
    <OnlineStatusBar :room="room" :game-state="gameState" />
    <div v-if="!gameState" class="waiting">正在同步战场状态...</div>
    <div v-else class="stage"><canvas ref="canvasRef" class="canvas" /></div>
    <aside v-if="skillOpen && mePlayer" class="skill-live">
      <h3>对局实时技能</h3>
      <p class="hint">当前：{{ mySkillConfig?.name || '未装配' }}</p>
      <label>预设</label>
      <div class="row">
        <select v-model="skillPreset">
          <option v-for="p in SKILL_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <button type="button" @click="loadPreset">载入</button>
      </div>
      <label>技能名</label>
      <input v-model="skillName" />
      <label>冷却(ms)</label>
      <input v-model.number="skillCooldown" type="number" min="0" step="100" />
      <label>代码</label>
      <textarea v-model="skillSource" rows="10" spellcheck="false" />
      <div class="row">
        <button type="button" @click="syncSkill">实时同步</button>
        <button type="button" @click="unloadSkill">卸载</button>
      </div>
      <p class="hint">{{ skillHint }}</p>
    </aside>
  </section>
</template>

<style scoped>
.online-play {
  display: grid;
  gap: 10px;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.actions {
  display: flex;
  gap: 8px;
}
.stage {
  width: fit-content;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
}
.waiting {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(232, 240, 234, 0.82);
}
.canvas {
  display: block;
}
button {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  padding: 8px 10px;
}
.skill-live {
  position: fixed;
  right: 14px;
  top: 90px;
  width: min(360px, 40vw);
  max-height: calc(100vh - 130px);
  overflow: auto;
  z-index: 1200;
  display: grid;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: rgba(8, 14, 12, 0.92);
}
.skill-live h3 {
  margin: 0;
}
.skill-live .hint {
  margin: 0;
  color: rgba(232, 240, 234, 0.78);
  font-size: 0.82rem;
}
.skill-live input,
.skill-live select,
.skill-live textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  padding: 7px 8px;
}
.skill-live textarea {
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
}
.skill-live .row {
  display: flex;
  gap: 8px;
}
</style>
