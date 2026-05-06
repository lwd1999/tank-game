<script setup>
import { computed, ref, watch } from 'vue'
import { COLS, ROWS } from '../game/constants.js'
import { TILE_BRICK, TILE_STEEL, TILE_BUSH, tileClassSuffix } from '../game/tiles.js'

const props = defineProps({
  modelValue: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue'])

const localWalls = ref([])
const localEnemies = ref([])
const localSpawns = ref([])
const tool = ref('brick')

watch(
  () => props.modelValue,
  (v) => {
    localWalls.value = (v?.walls || []).map((row) => [...row])
    localEnemies.value = (v?.enemies || []).map((e) => ({ ...e }))
    localSpawns.value = (v?.playerSpawns || []).map((s) => ({ ...s }))
  },
  { immediate: true, deep: true },
)

const tools = [
  ['brick', '砖墙'],
  ['steel', '钢墙'],
  ['bush', '草丛'],
  ['spawn', '出生点'],
  ['enemy', '敌人'],
  ['erase', '擦除'],
]

function enemyIndexAt(r, c) {
  return localEnemies.value.findIndex((e) => e.r === r && e.c === c)
}
function spawnIndexAt(r, c) {
  return localSpawns.value.findIndex((s) => s.r === r && s.c === c)
}

function clickCell(r, c) {
  if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return
  const walls = localWalls.value.map((row) => [...row])
  const ei = enemyIndexAt(r, c)
  const si = spawnIndexAt(r, c)
  if (tool.value === 'erase') {
    walls[r][c] = 0
    if (ei >= 0) localEnemies.value = localEnemies.value.filter((_, i) => i !== ei)
    if (si >= 0) localSpawns.value = localSpawns.value.filter((_, i) => i !== si)
  } else if (tool.value === 'brick') {
    walls[r][c] = TILE_BRICK
  } else if (tool.value === 'steel') {
    walls[r][c] = TILE_STEEL
  } else if (tool.value === 'bush') {
    walls[r][c] = TILE_BUSH
  } else if (tool.value === 'spawn') {
    if (walls[r][c] !== TILE_STEEL && walls[r][c] !== TILE_BRICK) {
      if (si >= 0) localSpawns.value = localSpawns.value.filter((_, i) => i !== si)
      else localSpawns.value = [...localSpawns.value, { r, c }]
      if (ei >= 0) localEnemies.value = localEnemies.value.filter((_, i) => i !== ei)
    }
  } else if (tool.value === 'enemy') {
    if (walls[r][c] !== TILE_STEEL && walls[r][c] !== TILE_BRICK) {
      if (ei >= 0) localEnemies.value = localEnemies.value.filter((_, i) => i !== ei)
      else localEnemies.value = [...localEnemies.value, { r, c, type: 'assault' }]
      if (si >= 0) localSpawns.value = localSpawns.value.filter((_, i) => i !== si)
    }
  }
  localWalls.value = walls
}

function applyMap() {
  emit('update:modelValue', {
    walls: localWalls.value.map((r) => [...r]),
    enemies: localEnemies.value.map((e) => ({ ...e })),
    playerSpawns: localSpawns.value.map((s) => ({ ...s })),
  })
}

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${COLS}, 22px)`,
  gridTemplateRows: `repeat(${ROWS}, 22px)`,
}))

const cells = computed(() => {
  const out = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) out.push({ r, c, key: `${r}-${c}` })
  }
  return out
})
</script>

<template>
  <div class="rm-wrap">
    <div class="bar">
      <button v-for="t in tools" :key="t[0]" type="button" :class="{ on: tool === t[0] }" @click="tool = t[0]">
        {{ t[1] }}
      </button>
      <button type="button" class="apply" @click="applyMap">应用到房间</button>
    </div>
    <div class="grid" :style="gridStyle">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="cell"
        :class="'t-' + tileClassSuffix(localWalls[cell.r]?.[cell.c] || 0)"
        @click="clickCell(cell.r, cell.c)"
      >
        <span v-if="spawnIndexAt(cell.r, cell.c) >= 0" class="mark spawn">P</span>
        <span v-if="enemyIndexAt(cell.r, cell.c) >= 0" class="mark enemy">E</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.rm-wrap { display: grid; gap: 10px; }
.bar { display: flex; gap: 8px; flex-wrap: wrap; }
.bar button { border: 1px solid var(--border); border-radius: 10px; background: rgba(255,255,255,0.06); color: var(--text); padding: 6px 10px; }
.bar button.on { border-color: rgba(52,211,153,0.7); background: rgba(52,211,153,0.14); }
.bar button.apply { margin-left: auto; background: linear-gradient(145deg, #10b981, #059669); color: #052e1a; }
.grid { display: grid; gap: 0; width: fit-content; border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; overflow: hidden; }
.cell { width: 22px; height: 22px; border: none; margin: 0; padding: 0; background: transparent; position: relative; }
.mark { position: absolute; inset: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
.mark.spawn { color: #34d399; }
.mark.enemy { color: #f87171; }
.t-brick { background: #7c4e32; }
.t-steel { background: #454b54; }
.t-bush { background: #2e6b35; }
</style>
