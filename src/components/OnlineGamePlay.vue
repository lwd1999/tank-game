<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { COLS, ROWS, CELL } from '../game/constants.js'
import { drawBattlefield } from '../game/renderBattleCanvas.js'
import { loadSkins } from '../game/skinsStorage.js'
import OnlineStatusBar from './OnlineStatusBar.vue'

const props = defineProps({
  room: { type: Object, required: true },
  user: { type: Object, required: true },
  gameState: { type: Object, required: true },
  connected: { type: Boolean, default: false },
  sendInput: { type: Function, required: true },
})

const emit = defineEmits(['leave'])
const canvasRef = ref(null)
const skins = ref(loadSkins())
const battleImages = { bg: null, player: null, enemy: null }
let canvasCtx = null
let inputTimer = 0
const pressed = ref(new Set())
const oneShot = ref({ toggleWeapon: false, useSkill: false })

const mePlayer = computed(() => props.room.players.find((p) => p.userId === props.user.id) || null)

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
  if (!me) return { turn: null, move: false, fire: false, toggleWeapon: false, useSkill: false }
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
  }
}

function flushInput() {
  if (!props.connected) return
  if (!mePlayer.value) return
  props.sendInput(currentInput())
  oneShot.value.toggleWeapon = false
  oneShot.value.useSkill = false
}

function onDown(e) {
  const me = mePlayer.value
  if (!me) return
  const key = normalizeKey(e.key)
  pressed.value.add(key)
  if (key === me.keybinds?.toggleWeapon && !e.repeat) oneShot.value.toggleWeapon = true
  if (key === me.keybinds?.skill && !e.repeat) oneShot.value.useSkill = true
  e.preventDefault()
}

function onUp(e) {
  pressed.value.delete(normalizeKey(e.key))
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
  { deep: true },
)

onMounted(() => {
  resizeCanvas()
  syncImages()
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  inputTimer = window.setInterval(flushInput, 50)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onDown)
  window.removeEventListener('keyup', onUp)
  window.clearInterval(inputTimer)
})
</script>

<template>
  <section class="online-play">
    <header class="top">
      <h2>联机战场</h2>
      <button type="button" @click="emit('leave')">返回房间</button>
    </header>
    <OnlineStatusBar :room="room" :game-state="gameState" />
    <div class="stage"><canvas ref="canvasRef" class="canvas" /></div>
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
.stage {
  width: fit-content;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
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
</style>
