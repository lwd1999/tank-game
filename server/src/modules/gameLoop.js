import { createPlayState, stepGame } from '../../../src/game/engine.js'
import { TICK_MS } from '../config.js'
const START_FREEZE_MS = 3000

function copyTank(t) {
  if (!t) return null
  return {
    r: t.r,
    c: t.c,
    dir: t.dir,
    alive: t.alive,
    shootCd: t.shootCd,
    moveCd: t.moveCd,
    skillCd: t.skillCd,
    slideMs: t.slideMs,
    slideDur: t.slideDur,
    slideDir: t.slideDir,
    weapon: t.weapon,
  }
}

function copyEnemies(enemies) {
  return (enemies || []).map((e) => ({
    r: e.r,
    c: e.c,
    dir: e.dir,
    type: e.type,
    hp: e.hp,
    maxHp: e.maxHp,
    alive: e.alive,
    slideMs: e.slideMs,
    slideDur: e.slideDur,
    slideDir: e.slideDir,
  }))
}

function copyBullets(bullets) {
  return (bullets || []).map((b) => ({ pr: b.pr, pc: b.pc, dir: b.dir, owner: b.owner }))
}

function copyCustomFx(customFx) {
  return {
    shells: (customFx?.shells || []).map((x) => ({ ...x })),
    explosions: (customFx?.explosions || []).map((x) => ({ ...x })),
    chainLasers: (customFx?.chainLasers || []).map((x) => ({ ...x })),
  }
}

function copyCustomProjectiles(projectiles) {
  return (projectiles || []).map((p) => ({
    x: p.x,
    y: p.y,
    dir: p.dir,
    owner: p.owner,
    speed: p.speed,
    radius: p.radius,
    damage: p.damage,
    kill: p.kill,
    bodyRadius: p.bodyRadius,
    pierceEnemies: p.pierceEnemies,
    throughTiles: p.throughTiles,
    color: p.color,
    size: p.size,
  }))
}

function wallsSignature(walls) {
  let acc = ''
  for (let r = 0; r < walls.length; r++) {
    acc += walls[r].join('')
    acc += ';'
  }
  return acc
}

function createPublicSnapshot(state, includeWalls) {
  return {
    walls: includeWalls ? state.walls.map((row) => [...row]) : undefined,
    player: copyTank(state.player),
    ally: copyTank(state.ally),
    bullets: copyBullets(state.bullets),
    won: !!state.won,
    lost: !!state.lost,
    lastBulletTick: state.lastBulletTick || 0,
    laserFlash: state.laserFlash ? { ...state.laserFlash } : null,
    customFx: copyCustomFx(state.customFx),
    customProjectiles: copyCustomProjectiles(state.customProjectiles),
  }
}

function enemyEquals(a, b) {
  return (
    a.r === b.r &&
    a.c === b.c &&
    a.dir === b.dir &&
    a.type === b.type &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.alive === b.alive &&
    a.slideMs === b.slideMs &&
    a.slideDur === b.slideDur &&
    a.slideDir === b.slideDir
  )
}

function buildEnemyDeltaPayload(enemies, prevEnemies) {
  const next = copyEnemies(enemies)
  if (!prevEnemies || prevEnemies.length !== next.length) {
    return { enemies: next, nextCache: next }
  }
  /** @type {Array<{ i:number, e:any }>} */
  const enemyPatch = []
  const cache = prevEnemies.map((e) => ({ ...e }))
  for (let i = 0; i < next.length; i++) {
    if (enemyEquals(next[i], prevEnemies[i])) continue
    enemyPatch.push({ i, e: next[i] })
    cache[i] = next[i]
  }
  if (enemyPatch.length === 0) return { nextCache: cache }
  return { enemyPatch, nextCache: cache }
}

function emptyInput() {
  return { turn: null, move: false, fire: false, toggleWeapon: false, useSkill: false, cursor: null }
}

function toEngineInput(p1, p2) {
  return {
    turn: p1.turn || null,
    move: !!p1.move,
    fire: !!p1.fire,
    toggleWeapon: !!p1.toggleWeapon,
    useSkill: !!p1.useSkill,
    cursor: p1.cursor || null,
    p2: {
      turn: p2.turn || null,
      move: !!p2.move,
      fire: !!p2.fire,
      toggleWeapon: !!p2.toggleWeapon,
      useSkill: !!p2.useSkill,
      cursor: p2.cursor || null,
    },
  }
}

export function createGameSession(room, emit) {
  const state = createPlayState(room.mapConfig)
  const hasP2 = room.players.some((p) => p.slot === 1)
  if (!hasP2 && state.ally) {
    state.ally.alive = false
  }
  const slotInputs = [emptyInput(), emptyInput()]
  let timer = null
  let last = Date.now()
  let warmupMs = START_FREEZE_MS
  let lastWallsSig = ''
  let enemyCache = null

  function tick() {
    const now = Date.now()
    const dt = Math.min(80, Math.max(10, now - last))
    last = now
    if (warmupMs > 0) {
      warmupMs = Math.max(0, warmupMs - dt)
      const sig = wallsSignature(state.walls)
      const includeWalls = sig !== lastWallsSig
      if (includeWalls) lastWallsSig = sig
      const snap = createPublicSnapshot(state, includeWalls)
      const enemyDelta = buildEnemyDeltaPayload(state.enemies, enemyCache)
      enemyCache = enemyDelta.nextCache
      if (enemyDelta.enemies) snap.enemies = enemyDelta.enemies
      if (enemyDelta.enemyPatch) snap.enemyPatch = enemyDelta.enemyPatch
      emit('game:state', { roomId: room.id, state: snap })
      return
    }
    const input = toEngineInput(slotInputs[0], slotInputs[1])
    stepGame(state, dt, input)
    slotInputs[0].toggleWeapon = false
    slotInputs[0].useSkill = false
    slotInputs[1].toggleWeapon = false
    slotInputs[1].useSkill = false
    const sig = wallsSignature(state.walls)
    const includeWalls = sig !== lastWallsSig
    if (includeWalls) lastWallsSig = sig
    const snap = createPublicSnapshot(state, includeWalls)
    const enemyDelta = buildEnemyDeltaPayload(state.enemies, enemyCache)
    enemyCache = enemyDelta.nextCache
    if (enemyDelta.enemies) snap.enemies = enemyDelta.enemies
    if (enemyDelta.enemyPatch) snap.enemyPatch = enemyDelta.enemyPatch
    emit('game:state', { roomId: room.id, state: snap })
    if (state.won || state.lost) {
      room.status = 'waiting'
      room.players.forEach((p) => {
        p.ready = false
      })
      emit('game:end', { roomId: room.id, state })
      stop()
    }
  }

  function start() {
    if (timer) return
    last = Date.now()
    timer = setInterval(tick, TICK_MS)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  function setInput(slot, nextInput) {
    if (slot < 0 || slot > 1) return
    slotInputs[slot] = {
      ...slotInputs[slot],
      turn: typeof nextInput.turn === 'string' ? nextInput.turn : null,
      move: !!nextInput.move,
      fire: !!nextInput.fire,
      toggleWeapon: !!nextInput.toggleWeapon || slotInputs[slot].toggleWeapon,
      useSkill: !!nextInput.useSkill || slotInputs[slot].useSkill,
      cursor: nextInput.cursor && typeof nextInput.cursor === 'object' ? nextInput.cursor : slotInputs[slot].cursor,
    }
  }

  return { state, start, stop, setInput }
}
