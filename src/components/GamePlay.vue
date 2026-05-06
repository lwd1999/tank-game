<script setup>
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'
import { COLS, ROWS, CELL } from '../game/constants.js'
import { loadCustomMap } from '../game/storage.js'
import { createPlayState, stepGame } from '../game/engine.js'
import { loadSkins } from '../game/skinsStorage.js'
import { drawBattlefield } from '../game/renderBattleCanvas.js'
import {
  BIND_ACTIONS,
  buildLocalInput,
  formatKeyList,
  getActionKeys,
  isControlKey,
  loadControlScheme,
  normalizeKey,
  saveControlScheme,
  setActionKeys,
  DEFAULT_CONTROL_SCHEME,
} from '../game/inputMapper.js'
import CenterDialog from './CenterDialog.vue'

const emit = defineEmits(['back', 'edit'])

const HELP_KEY = 'tank-battle-play-hint-v2'

const state = shallowRef(createPlayState(loadCustomMap()))
const keys = ref(new Set())
const skins = ref(loadSkins())
const controls = ref(loadControlScheme())

const pendingActions = ref({
  p1ToggleWeapon: false,
  p1UseSkill: false,
  p2ToggleWeapon: false,
  p2UseSkill: false,
})

const cellPx = ref(CELL)
const canvasRef = ref(null)
const fsRoot = ref(null)
const topRef = ref(null)
const abilityRef = ref(null)
const browserFs = ref(false)

/** @type {{ bg: HTMLImageElement | null, player: HTMLImageElement | null, enemy: HTMLImageElement | null }} */
const battleImages = { bg: null, player: null, enemy: null }

let canvasCtx = null
let dpr = 1

const noEnemies = computed(() => state.value.enemies.length === 0)

const helpOpen = ref(false)
const keybindOpen = ref(false)
const keyCaptureAction = ref('')
const endOpen = ref(false)
const endTitle = ref('')
const endMessage = ref('')
const endVariant = ref('primary')

const weaponHud = ref('炮弹')
const skillHud = ref('跃迁就绪')
const p2WeaponHud = ref('炮弹')
const p2SkillHud = ref('跃迁就绪')

const helpMessage = computed(() => {
  const base =
    `P1：${formatKeyList(controls.value.p1.up)}/${formatKeyList(controls.value.p1.down)}/${formatKeyList(controls.value.p1.left)}/${formatKeyList(controls.value.p1.right)} 移动，${formatKeyList(controls.value.p1.fire)} 射击，${formatKeyList(controls.value.p1.toggleWeapon)} 切换武器，${formatKeyList(controls.value.p1.skill)} 瞬移技能。\nP2：${formatKeyList(controls.value.p2.up)}/${formatKeyList(controls.value.p2.down)}/${formatKeyList(controls.value.p2.left)}/${formatKeyList(controls.value.p2.right)} 移动，${formatKeyList(controls.value.p2.fire)} 射击，${formatKeyList(controls.value.p2.toggleWeapon)} 切换武器，${formatKeyList(controls.value.p2.skill)} 瞬移技能。\n地图可配置多个出生点（当前前两个用于 P1/P2，后续可扩展）。\n双人互伤：P1/P2 可互相打中。\n激光可穿透砖墙/钢墙/草丛，并可一次贯穿多辆敌方坦克。\n敌方有轻型/突击/重型三类，血量不同，不再一炮全秒。\n自定义贴图与背景在「编辑地图」页上传。`
  if (noEnemies.value) {
    return `${base}\n\n当前地图没有敌方坦克，无法达成胜利，仍可试玩。`
  }
  return base
})

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null)
      return
    }
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => resolve(null)
    im.src = src
  })
}

async function syncBattleImages() {
  const sk = skins.value
  const [bg, player, enemy] = await Promise.all([loadImage(sk.battlefield), loadImage(sk.player), loadImage(sk.enemy)])
  battleImages.bg = bg
  battleImages.player = player
  battleImages.enemy = enemy
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const cell = cellPx.value
  const cssW = COLS * cell
  const cssH = ROWS * cell
  dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvasCtx = canvas.getContext('2d', { alpha: false })
  if (!canvasCtx) return
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  canvasCtx.imageSmoothingEnabled = true
}

function paint() {
  if (!canvasCtx) return
  const s = state.value
  drawBattlefield(canvasCtx, s, {
    cell: cellPx.value,
    cols: COLS,
    rows: ROWS,
    bg: battleImages.bg,
    player: battleImages.player,
    enemy: battleImages.enemy,
    bgMask: skins.value.battlefieldMask,
  })
}

function updateWeaponHud(s) {
  const label = s.player.weapon === 'laser' ? '激光炮' : '炮弹'
  if (weaponHud.value !== label) weaponHud.value = label
  const p1SkillKey = formatKeyList(controls.value.p1.skill)
  skillHud.value = s.player.skillCd <= 0 ? `跃迁就绪(${p1SkillKey})` : `跃迁冷却 ${Math.ceil(s.player.skillCd / 100) / 10}s`
  const p2Label = s.ally?.weapon === 'laser' ? '激光炮' : '炮弹'
  p2WeaponHud.value = p2Label
  const p2SkillKey = formatKeyList(controls.value.p2.skill)
  p2SkillHud.value = (s.ally?.skillCd || 0) <= 0 ? `跃迁就绪(${p2SkillKey})` : `跃迁冷却 ${Math.ceil((s.ally?.skillCd || 0) / 100) / 10}s`
}

function updateCellSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const topH = topRef.value?.getBoundingClientRect().height ?? 76
  const abilityH = abilityRef.value?.getBoundingClientRect().height ?? 58

  // play-fs padding(16*2) + 两段垂直 gap(约 14*2) + 舞台容器内外边距
  const chromeY = 32 + 28 + topH + abilityH
  const chromeX = 32
  const stagePadding = 36 // shell(24) + inner(12)

  const availW = Math.max(220, vw - chromeX - stagePadding)
  const availH = Math.max(220, vh - chromeY - stagePadding)
  const raw = Math.floor(Math.min(availW / COLS, availH / ROWS))

  cellPx.value = Math.max(10, Math.min(54, raw))
  resizeCanvas()
  paint()
}

async function toggleBrowserFullscreen() {
  const el = fsRoot.value
  if (!el) return
  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen()
      browserFs.value = true
    } else {
      await document.exitFullscreen()
      browserFs.value = false
    }
  } catch {
    /* ignore */
  }
}

function onFsChange() {
  browserFs.value = !!document.fullscreenElement
  updateCellSize()
}

let raf = 0
let last = 0

function restart() {
  skins.value = loadSkins()
  state.value = createPlayState(loadCustomMap())
  endOpen.value = false
  last = performance.now()
  updateWeaponHud(state.value)
  resizeCanvas()
  paint()
  syncBattleImages().then(() => paint())
}

function loop(now) {
  if (helpOpen.value || keybindOpen.value || endOpen.value) {
    const pauseDt = Math.min(32, Math.max(0, now - last))
    last = now
    const s = state.value
    if (s.laserFlash) {
      s.laserFlash.ms -= pauseDt
      if (s.laserFlash.ms <= 0) s.laserFlash = null
    }
    paint()
    raf = requestAnimationFrame(loop)
    return
  }

  const dt = Math.min(50, now - last)
  last = now
  const s = state.value

  const input = buildLocalInput(keys.value, pendingActions.value, controls.value)
  pendingActions.value = {
    p1ToggleWeapon: false,
    p1UseSkill: false,
    p2ToggleWeapon: false,
    p2UseSkill: false,
  }

  if (s.won || s.lost) {
    input.move = false
    input.fire = false
    input.p2.move = false
    input.p2.fire = false
  }

  stepGame(s, dt, input)

  if (s.won && !endOpen.value) {
    endTitle.value = '任务完成'
    endMessage.value = '敌方单位已清除。'
    endVariant.value = 'primary'
    endOpen.value = true
  } else if (s.lost && !endOpen.value) {
    endTitle.value = '战斗失败'
    endMessage.value = '我方坦克已被击毁。'
    endVariant.value = 'danger'
    endOpen.value = true
  }

  updateWeaponHud(s)
  paint()

  raf = requestAnimationFrame(loop)
}

function onDown(e) {
  if (keyCaptureAction.value) {
    const k = normalizeKey(e.key)
    controls.value = setActionKeys(controls.value, keyCaptureAction.value, [k])
    saveControlScheme(controls.value)
    keyCaptureAction.value = ''
    e.preventDefault()
    return
  }
  const k = normalizeKey(e.key)
  if (!e.repeat) {
    if (controls.value.p1.toggleWeapon.includes(k)) pendingActions.value.p1ToggleWeapon = true
    if (controls.value.p1.skill.includes(k)) pendingActions.value.p1UseSkill = true
    if (controls.value.p2.toggleWeapon.includes(k)) pendingActions.value.p2ToggleWeapon = true
    if (controls.value.p2.skill.includes(k)) pendingActions.value.p2UseSkill = true
  }
  keys.value.add(k)
  if (isControlKey(controls.value, k)) {
    e.preventDefault()
  }
}

function onUp(e) {
  keys.value.delete(normalizeKey(e.key))
}

const keybindRows = computed(() =>
  BIND_ACTIONS.map((a) => ({
    ...a,
    keys: getActionKeys(controls.value, a.id),
    text: formatKeyList(getActionKeys(controls.value, a.id)),
  })),
)

function startCapture(actionId) {
  keyCaptureAction.value = actionId
}

function clearCapture() {
  keyCaptureAction.value = ''
}

function resetControlKeys() {
  controls.value = loadControlScheme()
  controls.value = setActionKeys(controls.value, 'p1.up', DEFAULT_CONTROL_SCHEME.p1.up)
  controls.value = setActionKeys(controls.value, 'p1.down', DEFAULT_CONTROL_SCHEME.p1.down)
  controls.value = setActionKeys(controls.value, 'p1.left', DEFAULT_CONTROL_SCHEME.p1.left)
  controls.value = setActionKeys(controls.value, 'p1.right', DEFAULT_CONTROL_SCHEME.p1.right)
  controls.value = setActionKeys(controls.value, 'p1.fire', DEFAULT_CONTROL_SCHEME.p1.fire)
  controls.value = setActionKeys(controls.value, 'p1.toggleWeapon', DEFAULT_CONTROL_SCHEME.p1.toggleWeapon)
  controls.value = setActionKeys(controls.value, 'p1.skill', DEFAULT_CONTROL_SCHEME.p1.skill)
  controls.value = setActionKeys(controls.value, 'p2.up', DEFAULT_CONTROL_SCHEME.p2.up)
  controls.value = setActionKeys(controls.value, 'p2.down', DEFAULT_CONTROL_SCHEME.p2.down)
  controls.value = setActionKeys(controls.value, 'p2.left', DEFAULT_CONTROL_SCHEME.p2.left)
  controls.value = setActionKeys(controls.value, 'p2.right', DEFAULT_CONTROL_SCHEME.p2.right)
  controls.value = setActionKeys(controls.value, 'p2.fire', DEFAULT_CONTROL_SCHEME.p2.fire)
  controls.value = setActionKeys(controls.value, 'p2.toggleWeapon', DEFAULT_CONTROL_SCHEME.p2.toggleWeapon)
  controls.value = setActionKeys(controls.value, 'p2.skill', DEFAULT_CONTROL_SCHEME.p2.skill)
  saveControlScheme(controls.value)
}

function onHelpConfirm() {
  try {
    sessionStorage.setItem(HELP_KEY, '1')
  } catch {
    /* ignore */
  }
}

function onEndReplay() {
  restart()
}

function onEndEdit() {
  endOpen.value = false
  emit('edit')
}

function exitPlay() {
  emit('back')
}

onMounted(async () => {
  last = performance.now()
  document.body.classList.add('play-fs-active')
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('resize', updateCellSize)
  document.addEventListener('fullscreenchange', onFsChange)
  updateCellSize()
  await syncBattleImages()
  updateWeaponHud(state.value)
  paint()
  raf = requestAnimationFrame(loop)

  try {
    helpOpen.value = !sessionStorage.getItem(HELP_KEY)
  } catch {
    helpOpen.value = true
  }
})

onUnmounted(() => {
  document.body.classList.remove('play-fs-active')
  window.removeEventListener('keydown', onDown)
  window.removeEventListener('keyup', onUp)
  window.removeEventListener('resize', updateCellSize)
  document.removeEventListener('fullscreenchange', onFsChange)
  cancelAnimationFrame(raf)
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
})
</script>

<template>
  <div ref="fsRoot" class="play-fs">
    <CenterDialog
      v-model:open="helpOpen"
      title="操作说明"
      :message="helpMessage"
      variant="neutral"
      confirm-text="知道了"
      @confirm="onHelpConfirm"
    />

    <CenterDialog v-model:open="keybindOpen" title="键位设置" variant="neutral" confirm-text="完成">
      <div class="keybind-body">
        <p class="keybind-hint">点击任意操作右侧按钮后，按下新按键即可生效并自动保存。</p>
        <div class="keybind-grid">
          <div v-for="row in keybindRows" :key="row.id" class="keybind-row">
            <span class="name">{{ row.label }}</span>
            <button
              type="button"
              class="bind-btn"
              :class="{ waiting: keyCaptureAction === row.id }"
              @click="startCapture(row.id)"
            >
              {{ keyCaptureAction === row.id ? '按下新按键…' : row.text }}
            </button>
          </div>
        </div>
        <div class="keybind-actions">
          <button type="button" class="tb tb-ghost" @click="clearCapture">取消等待</button>
          <button type="button" class="tb tb-ghost" @click="resetControlKeys">恢复默认键位</button>
        </div>
      </div>
    </CenterDialog>

    <CenterDialog
      v-model:open="endOpen"
      :title="endTitle"
      :message="endMessage"
      :variant="endVariant"
      confirm-text="再来一局"
      :show-cancel="true"
      cancel-text="返回编辑"
      @confirm="onEndReplay"
      @cancel="onEndEdit"
    />

    <header ref="topRef" class="play-top">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true" />
        <div class="brand-text">
          <span class="brand-title">战场</span>
          <span class="brand-sub">Canvas 渲染 · 全屏沉浸</span>
        </div>
      </div>
      <nav class="toolbar">
        <button type="button" class="tb tb-quiet" @click="exitPlay">退出</button>
        <button type="button" class="tb" @click="emit('edit')">编辑</button>
        <button type="button" class="tb" @click="restart">重开</button>
        <button type="button" class="tb tb-ghost" @click="toggleBrowserFullscreen">
          {{ browserFs ? '退出全屏' : '全屏' }}
        </button>
        <button type="button" class="tb tb-ghost" @click="helpOpen = true">说明</button>
        <button type="button" class="tb tb-ghost" @click="keybindOpen = true">改键</button>
      </nav>
    </header>

    <div class="stage-shell">
      <div class="stage-inner">
        <canvas ref="canvasRef" class="battle-canvas" />
      </div>
    </div>

    <footer ref="abilityRef" class="ability-bar">
      <div class="ability-chip" :class="{ active: weaponHud === '激光炮' }">
        <span class="key">{{ formatKeyList(controls.p1.toggleWeapon) }}</span>
        <span class="meta">
          <strong>P1 武器</strong>
          <small>{{ weaponHud }}</small>
        </span>
      </div>
      <div class="ability-chip" :class="{ ready: skillHud.includes('就绪') }">
        <span class="key">{{ formatKeyList(controls.p1.skill) }}</span>
        <span class="meta">
          <strong>P1 跃迁</strong>
          <small>{{ skillHud }}</small>
        </span>
      </div>
      <div class="ability-chip p2" :class="{ active: p2WeaponHud === '激光炮' }">
        <span class="key">{{ formatKeyList(controls.p2.toggleWeapon) }}</span>
        <span class="meta">
          <strong>P2 武器</strong>
          <small>{{ p2WeaponHud }}</small>
        </span>
      </div>
      <div class="ability-chip p2" :class="{ ready: p2SkillHud.includes('就绪') }">
        <span class="key">{{ formatKeyList(controls.p2.skill) }}</span>
        <span class="meta">
          <strong>P2 跃迁</strong>
          <small>{{ p2SkillHud }}</small>
        </span>
      </div>
      <div class="ability-chip p2">
        <span class="key">{{ formatKeyList(controls.p2.fire) }}</span>
        <span class="meta">
          <strong>P2 射击</strong>
          <small>{{ state.ally?.alive ? '在线作战' : '已阵亡' }}</small>
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.play-fs {
  --play-surface: rgba(14, 18, 16, 0.82);
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 16px;
  box-sizing: border-box;
  background:
    radial-gradient(100% 75% at 75% -20%, rgba(34, 211, 238, 0.12), transparent 45%),
    radial-gradient(120% 80% at 18% 0%, rgba(52, 211, 153, 0.09), transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(0, 0, 0, 0.62), #040605);
  color: var(--text, #e8eeea);
}

.play-top {
  width: min(1120px, 100%);
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px 16px;
  padding: 12px 16px;
  border-radius: 16px;
  background:
    linear-gradient(155deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015)),
    var(--play-surface);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 50px rgba(0, 0, 0, 0.45);
}

@media (max-width: 720px) {
  .play-top {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .toolbar {
    justify-content: center;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.brand-mark {
  width: 10px;
  height: 36px;
  border-radius: 999px;
  background: linear-gradient(180deg, #34d399, #059669);
  box-shadow: 0 0 20px rgba(52, 211, 153, 0.35);
  flex-shrink: 0;
}
.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.brand-title {
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.brand-sub {
  font-size: 0.72rem;
  opacity: 0.62;
  letter-spacing: 0.02em;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.tb {
  padding: 8px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.12s ease;
}
.tb:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
.tb:active {
  transform: translateY(1px);
}
.tb-ghost {
  background: transparent;
  opacity: 0.92;
}
.tb-quiet {
  border-color: rgba(251, 191, 36, 0.35);
  color: #fde68a;
}

.stage-shell {
  flex: 0 1 auto;
  width: fit-content;
  max-width: 100%;
  max-height: 100%;
  padding: 12px;
  border-radius: 20px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
    linear-gradient(180deg, rgba(2, 10, 8, 0.65), rgba(2, 8, 6, 0.55));
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.35) inset,
    0 0 34px rgba(45, 250, 200, 0.08),
    0 28px 80px rgba(0, 0, 0, 0.55);
}

.stage-inner {
  border-radius: 14px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
  max-height: inherit;
}

.battle-canvas {
  display: block;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}

.ability-bar {
  width: min(1120px, 100%);
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ability-chip {
  min-width: 190px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(8, 14, 11, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4);
}
.ability-chip.active {
  border-color: rgba(110, 255, 220, 0.5);
  box-shadow: 0 0 0 1px rgba(110, 255, 220, 0.2), 0 10px 26px rgba(0, 0, 0, 0.4);
}
.ability-chip.ready {
  border-color: rgba(52, 211, 153, 0.5);
}
.ability-chip.p2 {
  border-color: rgba(96, 165, 250, 0.45);
}
.ability-chip .key {
  min-width: 36px;
  height: 28px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  font-weight: 700;
  font-size: 0.72rem;
  white-space: nowrap;
}
.ability-chip .meta {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.ability-chip .meta strong {
  font-size: 0.8rem;
}
.ability-chip .meta small {
  margin-top: 4px;
  font-size: 0.72rem;
  opacity: 0.8;
}

.keybind-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.keybind-hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.82;
}
.keybind-grid {
  display: grid;
  gap: 8px;
}
.keybind-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}
.keybind-row .name {
  font-size: 0.84rem;
}
.bind-btn {
  min-width: 140px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  cursor: pointer;
}
.bind-btn.waiting {
  border-color: rgba(52, 211, 153, 0.65);
  background: rgba(52, 211, 153, 0.16);
}
.keybind-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
