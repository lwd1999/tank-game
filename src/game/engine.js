import {
  COLS,
  ROWS,
  DIR_VEC,
  PLAYER_COOLDOWN_MS,
  PLAYER_MOVE_MS,
  BULLET_STEP_MS,
  LASER_COOLDOWN_MS,
  LASER_FLASH_MS,
  BLINK_SKILL_RANGE,
  BLINK_SKILL_COOLDOWN_MS,
} from './constants.js'
import { TILE_BRICK, TILE_STEEL, isSolidTile } from './tiles.js'

const ENEMY_ARCHETYPES = [
  { type: 'scout', hp: 1, moveBase: 320, shootBase: 520, shootChance: 0.019 },
  { type: 'assault', hp: 2, moveBase: 440, shootBase: 640, shootChance: 0.015 },
  { type: 'heavy', hp: 3, moveBase: 620, shootBase: 760, shootChance: 0.012 },
]
const CANNON_DAMAGE = 1
const LASER_DAMAGE = 2
const SKILL_MAX_RUNTIME_ERRORS = 6

function rollEnemyArchetype() {
  const r = Math.random()
  if (r < 0.45) return ENEMY_ARCHETYPES[0]
  if (r < 0.82) return ENEMY_ARCHETYPES[1]
  return ENEMY_ARCHETYPES[2]
}

function archetypeByType(type) {
  return ENEMY_ARCHETYPES.find((a) => a.type === type) || null
}

function cloneWalls(walls) {
  return walls.map((row) => [...row])
}

function findPlayerSpawn(walls) {
  const candidates = []
  for (let r = ROWS - 3; r < ROWS - 1; r++) {
    for (let c = 2; c < COLS - 2; c++) {
      if (!isSolidTile(walls[r][c]) && !isSolidTile(walls[r][c + 1])) candidates.push({ r, c })
    }
  }
  return candidates[Math.floor(candidates.length / 2)] || { r: ROWS - 2, c: Math.floor(COLS / 2) }
}

function isValidSpawnPoint(walls, s) {
  return !!s && s.r > 0 && s.r < ROWS - 1 && s.c > 0 && s.c < COLS - 1 && !isSolidTile(walls[s.r][s.c])
}

/**
 * @param {{ walls: number[][], playerSpawns?: { r: number, c: number }[], playerSpawn?: { r: number, c: number } | null, enemies: { r: number, c: number, type?: 'scout'|'assault'|'heavy' }[] }} mapData
 */
export function createPlayState(mapData) {
  const walls = cloneWalls(mapData.walls)
  const configuredSpawns = Array.isArray(mapData.playerSpawns) ? mapData.playerSpawns : mapData.playerSpawn ? [mapData.playerSpawn] : []
  const validSpawns = configuredSpawns.filter((s) => isValidSpawnPoint(walls, s)).map((s) => ({ r: s.r, c: s.c }))
  const spawn = validSpawns[0] || findPlayerSpawn(walls)
  const allySpawn =
    validSpawns[1] ||
    [
      { r: spawn.r, c: spawn.c + 1 },
      { r: spawn.r, c: spawn.c - 1 },
      { r: spawn.r - 1, c: spawn.c },
      { r: spawn.r + 1, c: spawn.c },
    ].find((p) => isValidSpawnPoint(walls, p)) ||
    spawn
  const player = {
    r: spawn.r,
    c: spawn.c,
    dir: 'up',
    alive: true,
    shootCd: 0,
    moveCd: 0,
    skillCd: 0,
    slideMs: 0,
    slideDur: PLAYER_MOVE_MS,
    /** @type {import('./constants.js').Dir} */
    slideDir: 'up',
    /** @type {'cannon'|'laser'} */
    weapon: 'cannon',
  }
  const ally = {
    r: allySpawn.r,
    c: allySpawn.c,
    dir: 'up',
    alive: true,
    shootCd: 0,
    moveCd: 0,
    skillCd: 0,
    slideMs: 0,
    slideDur: PLAYER_MOVE_MS,
    /** @type {import('./constants.js').Dir} */
    slideDir: 'up',
    /** @type {'cannon'|'laser'} */
    weapon: 'cannon',
  }
  const enemies = mapData.enemies
    .filter((e) => e.r > 0 && e.r < ROWS - 1 && e.c > 0 && e.c < COLS - 1)
    .filter((e) => !isSolidTile(walls[e.r][e.c]))
    .filter((e) => !validSpawns.some((s) => s.r === e.r && s.c === e.c))
    .filter((e) => !(e.r === spawn.r && e.c === spawn.c))
    .filter((e) => !(e.r === allySpawn.r && e.c === allySpawn.c))
    .map((e) => {
      const a = archetypeByType(e.type) || rollEnemyArchetype()
      return {
        r: e.r,
        c: e.c,
        dir: /** @type {import('./constants.js').Dir} */ (['down', 'left', 'right'][Math.floor(Math.random() * 3)]),
        type: a.type,
        hp: a.hp,
        maxHp: a.hp,
        moveBase: a.moveBase,
        shootBase: a.shootBase,
        shootChance: a.shootChance,
        alive: true,
        shootCd: Math.random() * a.shootBase,
        moveCd: Math.random() * a.moveBase,
        slideMs: 0,
        slideDur: a.moveBase,
        slideDir: /** @type {import('./constants.js').Dir} */ ('down'),
      }
    })
  /** @type {{ pr: number, pc: number, dir: import('./constants.js').Dir, fromPlayer: boolean }[]} */
  const bullets = []
  return {
    walls,
    player,
    ally,
    enemies,
    bullets,
    won: false,
    lost: false,
    lastEnemyMove: 0,
    lastBulletTick: 0,
    /** @type {null | { fr: number, fc: number, tr: number, tc: number, ms: number }} */
    laserFlash: null,
    /** @type {{ p1: null | { id?: string, name?: string, cooldownMs?: number, onCast?: (api: any) => any, onTick?: (api:any, dt:number) => any, onEvent?: (api:any, event:string, payload:any) => any, onEquip?: (api:any)=>any, onUnequip?: (api:any)=>any }, p2: null | { id?: string, name?: string, cooldownMs?: number, onCast?: (api: any) => any, onTick?: (api:any, dt:number) => any, onEvent?: (api:any, event:string, payload:any) => any, onEquip?: (api:any)=>any, onUnequip?: (api:any)=>any } }} */
    customSkills: { p1: null, p2: null },
    /** @type {{ shells: Array<{ fr:number, fc:number, tr:number, tc:number, ms:number, dur:number }>, explosions: Array<{ r:number, c:number, radius:number, ms:number, dur:number, delayMs:number }>, chainLasers: Array<{ fr:number, fc:number, tr:number, tc:number, ms:number, dur:number, delayMs:number, color?:string, seed:number }>, pendingHits: Array<{ r:number, c:number, radius:number, damage:number, kill:boolean, delayMs:number }>, pendingLaserHits: Array<{ damage:number, kill:boolean, delayMs:number, target:any }> }} */
    customFx: { shells: [], explosions: [], chainLasers: [], pendingHits: [], pendingLaserHits: [] },
    /** @type {Array<{ x:number, y:number, dir:import('./constants.js').Dir, owner:'p1'|'p2', speed:number, radius:number, damage:number, kill:boolean, bodyRadius?:number, pierceEnemies?:boolean, throughTiles?:boolean, color?:string, size?:number, hitRefs?: any[] }>} */
    customProjectiles: [],
    /** @type {{ p1: null | { r:number, c:number }, p2: null | { r:number, c:number } }} */
    skillCursor: { p1: null, p2: null },
  }
}

export function setCustomSkill(state, owner, skill) {
  if (!state?.customSkills) state.customSkills = { p1: null, p2: null }
  const prev = state.customSkills[owner]
  if (prev?.onUnequip) invokeSkillHook(state, owner, prev, 'onUnequip', () => prev.onUnequip(createSkillApi(state, owner)))
  if (skill && typeof skill.cast === 'function' && !skill.onCast) {
    skill = { ...skill, onCast: skill.cast }
  }
  if (skill) ensureSkillMeta(skill)
  state.customSkills[owner] = skill || null
  if (state.customSkills[owner]?.onEquip) {
    invokeSkillHook(state, owner, state.customSkills[owner], 'onEquip', () =>
      state.customSkills[owner].onEquip(createSkillApi(state, owner)),
    )
  }
  if (owner === 'p1' && state.player) state.player.skillCd = 0
  if (owner === 'p2' && state.ally) state.ally.skillCd = 0
}

function tankAt(state, r, c, ignore) {
  if (state.player.alive && state.player.r === r && state.player.c === c) {
    if (ignore !== 'player') return 'player'
  }
  if (state.ally?.alive && state.ally.r === r && state.ally.c === c) {
    if (ignore !== 'ally') return 'ally'
  }
  for (const e of state.enemies) {
    if (!e.alive) continue
    if (e.r === r && e.c === c) {
      if (ignore !== e) return 'enemy'
    }
  }
  return null
}

function collectOccupantsAt(state, r, c) {
  const out = []
  if (state.player.alive && state.player.r === r && state.player.c === c) out.push({ kind: 'player', ref: state.player })
  if (state.ally?.alive && state.ally.r === r && state.ally.c === c) out.push({ kind: 'ally', ref: state.ally })
  for (const e of state.enemies) {
    if (!e.alive) continue
    if (e.r === r && e.c === c) out.push({ kind: 'enemy', ref: e })
  }
  return out
}

function findNearestFreeCell(state, fromR, fromC, forbidR, forbidC) {
  let best = null
  let bestDist = Infinity
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (r === forbidR && c === forbidC) continue
      if (isSolidTile(state.walls[r][c])) continue
      if (tankAt(state, r, c, null)) continue
      const dist = Math.abs(r - fromR) + Math.abs(c - fromC)
      if (dist < bestDist) {
        bestDist = dist
        best = { r, c }
      }
    }
  }
  return best
}

function resolveTileOccupants(state, r, c, onOccupied = 'skip') {
  const occ = collectOccupantsAt(state, r, c)
  if (occ.length === 0) return true
  if (onOccupied === 'skip') return false
  if (onOccupied === 'kill') {
    for (const o of occ) {
      o.ref.alive = false
      if (o.kind === 'enemy') {
        o.ref.hp = 0
        dispatchSkillEvent(state, 'enemyKilled', { enemy: o.ref, by: 'tile' })
      }
    }
    return true
  }
  if (onOccupied === 'push') {
    for (const o of occ) {
      const next = findNearestFreeCell(state, o.ref.r, o.ref.c, r, c)
      if (!next) {
        o.ref.alive = false
        if (o.kind === 'enemy') {
          o.ref.hp = 0
          dispatchSkillEvent(state, 'enemyKilled', { enemy: o.ref, by: 'tile' })
        }
        continue
      }
      o.ref.r = next.r
      o.ref.c = next.c
      o.ref.slideMs = 0
    }
    return true
  }
  return false
}

function tryMoveTank(tank, walls, state, selfIgnore, slideDur = PLAYER_MOVE_MS) {
  const v = DIR_VEC[tank.dir]
  const nr = tank.r + v.dr
  const nc = tank.c + v.dc
  if (nr < 1 || nr >= ROWS - 1 || nc < 1 || nc >= COLS - 1) return false
  if (isSolidTile(walls[nr][nc])) return false
  const occ = tankAt(state, nr, nc, selfIgnore)
  if (occ) return false
  tank.r = nr
  tank.c = nc
  tank.slideDir = tank.dir
  tank.slideDur = slideDur
  tank.slideMs = slideDur
  return true
}

function insideInner(r, c) {
  return r >= 1 && r < ROWS - 1 && c >= 1 && c < COLS - 1
}

function aliveEnemyAt(state, r, c) {
  for (const e of state.enemies) {
    if (e.alive && e.r === r && e.c === c) return e
  }
  return null
}

function applyEnemyDamage(enemy, dmg, state = null) {
  if (!enemy.alive) return
  enemy.hp = Math.max(0, (enemy.hp ?? 1) - dmg)
  if (enemy.hp <= 0) {
    enemy.alive = false
    if (state) dispatchSkillEvent(state, 'enemyKilled', { enemy })
  }
}

function canTeleportTo(state, r, c, ignoreTag = 'player') {
  if (!insideInner(r, c)) return false
  if (isSolidTile(state.walls[r][c])) return false
  if (tankAt(state, r, c, ignoreTag)) return false
  return true
}

function faceTarget(from, to) {
  const dr = to.r - from.r
  const dc = to.c - from.c
  if (Math.abs(dr) > Math.abs(dc)) return dr > 0 ? 'down' : 'up'
  return dc > 0 ? 'right' : 'left'
}

function firePlayerBullet(state) {
  fireBulletFrom(state, state.player, 'p1')
}

function fireAllyBullet(state) {
  fireBulletFrom(state, state.ally, 'p2')
}

function fireBulletFrom(state, shooter, owner) {
  const v = DIR_VEC[shooter.dir]
  const br = shooter.r + v.dr
  const bc = shooter.c + v.dc
  if (br < 0 || br >= ROWS || bc < 0 || bc >= COLS) return
  const tile = state.walls[br][bc]
  if (tile === TILE_BRICK) {
    state.walls[br][bc] = 0
    return
  }
  if (tile === TILE_STEEL) return
  if (owner !== 'enemy') {
    const target = aliveEnemyAt(state, br, bc)
    if (target) {
      applyEnemyDamage(target, CANNON_DAMAGE, state)
      return
    }
  }
  if (owner === 'p1' && state.ally.alive && state.ally.r === br && state.ally.c === bc) {
    state.ally.alive = false
    return
  }
  if (owner === 'p2' && state.player.alive && state.player.r === br && state.player.c === bc) {
    state.player.alive = false
    return
  }
  if (owner === 'enemy') {
    if (state.player.alive && state.player.r === br && state.player.c === bc) {
      state.player.alive = false
      return
    }
    if (state.ally.alive && state.ally.r === br && state.ally.c === bc) {
      state.ally.alive = false
      return
    }
  }
  state.bullets.push({
    pr: br,
    pc: bc,
    dir: shooter.dir,
    owner,
  })
}

function tryBlinkStrikeByOwner(state, owner, opts = {}) {
  const actor = owner === 'p1' ? state.player : state.ally
  if (!actor?.alive) return false
  const selfIgnore = owner === 'p1' ? 'player' : 'ally'
  const range = Number.isFinite(Number(opts.range)) ? Number(opts.range) : BLINK_SKILL_RANGE
  const killLocked = !!opts.killLocked
  const fireAfterTeleport = opts.fireAfterTeleport !== false
  /** @type {null | { r: number, c: number, dir: import('./constants.js').Dir, dist: number, enemyRef: any }} */
  let nearest = null
  for (const e of state.enemies) {
    if (!e.alive) continue
    const dist = Math.abs(e.r - actor.r) + Math.abs(e.c - actor.c)
    if (dist > range) continue
    if (!nearest || dist < nearest.dist) {
      nearest = { r: e.r, c: e.c, dir: e.dir, dist, enemyRef: e }
    }
  }
  if (!nearest) return false

  const forward = DIR_VEC[nearest.dir]
  const left = { dr: -forward.dc, dc: forward.dr }
  const right = { dr: forward.dc, dc: -forward.dr }
  const candidates = [
    { r: nearest.r - forward.dr, c: nearest.c - forward.dc }, // 身后
    { r: nearest.r + left.dr, c: nearest.c + left.dc }, // 贴墙时左侧
    { r: nearest.r + right.dr, c: nearest.c + right.dc }, // 贴墙时右侧
    { r: nearest.r + forward.dr, c: nearest.c + forward.dc }, // 极端兜底
  ]

  let pos = candidates.find((p) => canTeleportTo(state, p.r, p.c, selfIgnore))
  if (!pos) {
    const around = [
      { r: nearest.r - 1, c: nearest.c },
      { r: nearest.r + 1, c: nearest.c },
      { r: nearest.r, c: nearest.c - 1 },
      { r: nearest.r, c: nearest.c + 1 },
    ]
    around.sort(
      (a, b) =>
        Math.abs(a.r - actor.r) + Math.abs(a.c - actor.c) - (Math.abs(b.r - actor.r) + Math.abs(b.c - actor.c)),
    )
    pos = around.find((p) => canTeleportTo(state, p.r, p.c, selfIgnore))
  }
  if (!pos) return false

  if (tankAt(state, pos.r, pos.c, selfIgnore)) return false
  actor.r = pos.r
  actor.c = pos.c
  actor.slideMs = 0
  actor.dir = faceTarget(pos, nearest)
  if (killLocked) {
    nearest.enemyRef.hp = 0
    nearest.enemyRef.alive = false
    dispatchSkillEvent(state, 'enemyKilled', { enemy: nearest.enemyRef, by: 'blink' })
  }
  if (fireAfterTeleport) {
    if (owner === 'p1') firePlayerBullet(state)
    else fireAllyBullet(state)
  }
  return true
}

function findShellImpact(state, shooter, maxRange = COLS + ROWS) {
  const v = DIR_VEC[shooter.dir]
  let r = shooter.r + v.dr
  let c = shooter.c + v.dc
  let steps = 0
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && steps++ < maxRange) {
    const tile = state.walls[r][c]
    const enemy = aliveEnemyAt(state, r, c)
    if (tile || enemy) return { r, c }
    r += v.dr
    c += v.dc
  }
  return {
    r: Math.max(0, Math.min(ROWS - 1, r - v.dr)),
    c: Math.max(0, Math.min(COLS - 1, c - v.dc)),
  }
}

function fireHeavyShellByOwner(state, owner, options = {}) {
  const shooter = owner === 'p1' ? state.player : state.ally
  if (!shooter?.alive) return false
  const impact = findShellImpact(state, shooter, Number(options.range) || COLS + ROWS)
  const travelMs = Math.max(80, Number(options.travelMs) || 260)
  const radius = Math.max(1, Number(options.radius) || 1)
  const damage = Math.max(1, Number(options.damage) || 3)
  const kill = options.kill === true
  state.customFx.shells.push({ fr: shooter.r, fc: shooter.c, tr: impact.r, tc: impact.c, ms: travelMs, dur: travelMs })
  state.customFx.explosions.push({ r: impact.r, c: impact.c, radius, ms: 220, dur: 220, delayMs: travelMs })
  state.customFx.pendingHits.push({ r: impact.r, c: impact.c, radius, damage, kill, delayMs: travelMs })
  return true
}

function nearestEnemyFromPoint(state, r, c, range, used) {
  let best = null
  let bestDist = Infinity
  for (const e of state.enemies) {
    if (!e.alive || used.has(e)) continue
    const dist = Math.abs(e.r - r) + Math.abs(e.c - c)
    if (dist > range) continue
    if (dist < bestDist) {
      bestDist = dist
      best = e
    }
  }
  return best
}

function castChainLaserByOwner(state, owner, options = {}) {
  const actor = owner === 'p1' ? state.player : state.ally
  if (!actor?.alive) return false
  const maxLinks = Math.max(1, Math.floor(Number(options.maxLinks) || 3))
  const range = Math.max(1, Number(options.range) || 14)
  const hopRange = Math.max(1, Number(options.hopRange) || 10)
  const hopDelayMs = Math.max(60, Number(options.hopDelayMs) || 220)
  const segmentMs = Math.max(90, Number(options.segmentMs) || 280)
  const damage = Math.max(1, Number(options.damage) || 2)
  const kill = options.kill !== false
  const color = typeof options.color === 'string' ? options.color : '#67e8f9'

  const used = new Set()
  const targets = []
  let from = { r: actor.r, c: actor.c }
  let first = nearestEnemyFromPoint(state, from.r, from.c, range, used)
  if (!first) return false
  targets.push(first)
  used.add(first)
  from = { r: first.r, c: first.c }
  while (targets.length < maxLinks) {
    const next = nearestEnemyFromPoint(state, from.r, from.c, hopRange, used)
    if (!next) break
    targets.push(next)
    used.add(next)
    from = { r: next.r, c: next.c }
  }

  let fr = actor.r
  let fc = actor.c
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    const delayMs = i * hopDelayMs
    state.customFx.chainLasers.push({
      fr,
      fc,
      tr: t.r,
      tc: t.c,
      ms: segmentMs,
      dur: segmentMs,
      delayMs,
      color,
      seed: Math.floor(Math.random() * 100000),
    })
    state.customFx.pendingLaserHits.push({
      target: t,
      damage,
      kill,
      delayMs: delayMs + Math.floor(segmentMs * 0.65),
    })
    fr = t.r
    fc = t.c
  }
  return targets.length > 0
}

function ensureSkillMeta(skill) {
  if (!skill || typeof skill !== 'object') return null
  if (skill.__meta && typeof skill.__meta === 'object') return skill.__meta
  const meta = { errors: 0, disabled: false, lastError: '' }
  Object.defineProperty(skill, '__meta', {
    value: meta,
    writable: true,
    enumerable: false,
    configurable: true,
  })
  return meta
}

function invokeSkillHook(state, owner, skill, _hookName, fn) {
  if (!skill) return undefined
  const meta = ensureSkillMeta(skill)
  if (meta?.disabled) return undefined
  try {
    const out = fn()
    if (meta) meta.errors = 0
    return out
  } catch (e) {
    if (meta) {
      meta.errors += 1
      meta.lastError = String(e?.message || e || 'runtime error')
      if (meta.errors >= SKILL_MAX_RUNTIME_ERRORS) {
        meta.disabled = true
      }
    }
    if (meta?.disabled && state?.customSkills?.[owner] === skill) {
      // Hard cut this broken skill to keep game loop healthy.
      state.customSkills[owner] = null
    }
    return undefined
  }
}

function dispatchSkillEvent(state, event, payload) {
  if (!state?.customSkills) return
  for (const owner of /** @type {const} */ (['p1', 'p2'])) {
    const skill = state.customSkills[owner]
    if (!skill?.onEvent) continue
    const actor = owner === 'p1' ? state.player : state.ally
    if (!actor?.alive) continue
    invokeSkillHook(state, owner, skill, 'onEvent', () => skill.onEvent(createSkillApi(state, owner), event, payload))
  }
}

function spawnCustomProjectile(state, owner, options = {}) {
  const shooter = owner === 'p1' ? state.player : state.ally
  if (!shooter?.alive) return false
  const v = DIR_VEC[shooter.dir]
  const x = shooter.c + v.dc
  const y = shooter.r + v.dr
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false
  const projectile = {
    x,
    y,
    dir: shooter.dir,
    owner,
    speed: Math.max(4, Number(options.speed) || 10),
    radius: Math.max(1, Number(options.radius) || 1),
    damage: Math.max(1, Number(options.damage) || 2),
    kill: options.kill === true,
    bodyRadius: Math.max(0, Math.floor(Number(options.bodyRadius) || 0)),
    pierceEnemies: options.pierceEnemies === true,
    throughTiles: options.throughTiles === true,
    color: typeof options.color === 'string' ? options.color : undefined,
    size: Number.isFinite(Number(options.size)) ? Math.max(0.12, Number(options.size)) : undefined,
  }
  // Internal cache for pierce hit tracking; keep non-enumerable to avoid bloating WS payloads.
  Object.defineProperty(projectile, 'hitRefs', {
    value: [],
    writable: true,
    enumerable: false,
    configurable: true,
  })
  state.customProjectiles.push(projectile)
  return true
}

function projectileTouchesTile(state, cellR, cellC, bodyRadius) {
  for (let dr = -bodyRadius; dr <= bodyRadius; dr++) {
    for (let dc = -bodyRadius; dc <= bodyRadius; dc++) {
      const rr = cellR + dr
      const cc = cellC + dc
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
      if (state.walls[rr][cc]) return true
    }
  }
  return false
}

function projectileTouchesEnemy(state, cellR, cellC, bodyRadius) {
  for (let dr = -bodyRadius; dr <= bodyRadius; dr++) {
    for (let dc = -bodyRadius; dc <= bodyRadius; dc++) {
      const rr = cellR + dr
      const cc = cellC + dc
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
      if (aliveEnemyAt(state, rr, cc)) return true
    }
  }
  return false
}

function applyProjectileAoeDamage(state, p, ir, ic) {
  const hitRefs = Array.isArray(p.hitRefs) ? [...p.hitRefs] : []
  for (let dr = -(p.radius || 1); dr <= (p.radius || 1); dr++) {
    for (let dc = -(p.radius || 1); dc <= (p.radius || 1); dc++) {
      const rr = ir + dr
      const cc = ic + dc
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
      const enemy = aliveEnemyAt(state, rr, cc)
      if (!enemy) continue
      if (p.pierceEnemies && hitRefs.includes(enemy)) continue
      if (p.kill) {
        enemy.hp = 0
        enemy.alive = false
        dispatchSkillEvent(state, 'enemyKilled', { enemy, by: 'projectile' })
      } else {
        applyEnemyDamage(enemy, p.damage || 1, state)
      }
      if (p.pierceEnemies) hitRefs.push(enemy)
    }
  }
  return hitRefs
}

function createSkillApi(state, owner) {
  const actor = owner === 'p1' ? state.player : state.ally
  const selfIgnore = owner === 'p1' ? 'player' : 'ally'
  return {
    owner,
    self: actor,
    state,
    getCursor() {
      const p = state.skillCursor?.[owner]
      if (!p) return null
      return { r: p.r, c: p.c }
    },
    getTile(r, c) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
      return state.walls[r][c]
    },
    setTile(r, c, tile, options = {}) {
      if (r < 1 || r >= ROWS - 1 || c < 1 || c >= COLS - 1) return false
      const t = Math.max(0, Number(tile) || 0)
      const mode = options?.onOccupied === 'kill' || options?.onOccupied === 'push' ? options.onOccupied : 'skip'
      if (t !== 0 && !resolveTileOccupants(state, r, c, mode)) return false
      state.walls[r][c] = t
      return true
    },
    listEnemies() {
      return state.enemies.filter((e) => e.alive)
    },
    findNearestEnemy(range = BLINK_SKILL_RANGE) {
      let best = null
      for (const e of state.enemies) {
        if (!e.alive) continue
        const dist = Math.abs(e.r - actor.r) + Math.abs(e.c - actor.c)
        if (dist > range) continue
        if (!best || dist < best.dist) best = { enemy: e, dist }
      }
      return best?.enemy || null
    },
    canTeleport(r, c) {
      return canTeleportTo(state, r, c, selfIgnore)
    },
    teleportTo(r, c) {
      if (!canTeleportTo(state, r, c, selfIgnore)) return false
      actor.r = r
      actor.c = c
      actor.slideMs = 0
      return true
    },
    faceTarget(target) {
      if (!target) return
      actor.dir = faceTarget(actor, target)
    },
    fireBullet() {
      if (owner === 'p1') firePlayerBullet(state)
      else fireAllyBullet(state)
    },
    fireLaser() {
      if (owner === 'p1') firePlayerLaser(state)
      else fireAllyLaser(state)
    },
    spawnEnemy(config = {}) {
      const r = Number(config.r)
      const c = Number(config.c)
      if (!insideInner(r, c)) return false
      if (isSolidTile(state.walls[r][c])) return false
      if (tankAt(state, r, c, null)) return false
      const a = archetypeByType(config.type) || rollEnemyArchetype()
      state.enemies.push({
        r,
        c,
        dir: config.dir || 'down',
        type: a.type,
        hp: a.hp,
        maxHp: a.hp,
        moveBase: a.moveBase,
        shootBase: a.shootBase,
        shootChance: a.shootChance,
        alive: true,
        shootCd: Math.random() * a.shootBase,
        moveCd: Math.random() * a.moveBase,
        slideMs: 0,
        slideDur: a.moveBase,
        slideDir: 'down',
      })
      return true
    },
    fireHeavyShell(options = {}) {
      return fireHeavyShellByOwner(state, owner, options)
    },
    castChainLaser(options = {}) {
      return castChainLaserByOwner(state, owner, options)
    },
    spawnProjectile(options = {}) {
      return spawnCustomProjectile(state, owner, options)
    },
    damageEnemy(enemy, dmg = 1) {
      if (!enemy) return
      applyEnemyDamage(enemy, Math.max(1, Number(dmg) || 1), state)
    },
    killEnemy(enemy) {
      if (!enemy) return
      enemy.hp = 0
      enemy.alive = false
      dispatchSkillEvent(state, 'enemyKilled', { owner, enemy })
    },
    blinkStrike(options = {}) {
      return tryBlinkStrikeByOwner(state, owner, options)
    },
  }
}

function sanitizeCursor(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = Number(raw.r)
  const c = Number(raw.c)
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null
  const rr = Math.max(0, Math.min(ROWS - 1, Math.round(r)))
  const cc = Math.max(0, Math.min(COLS - 1, Math.round(c)))
  return { r: rr, c: cc }
}

function executeCustomSkill(state, owner) {
  const actor = owner === 'p1' ? state.player : state.ally
  if (!actor?.alive) return false
  const skill = state.customSkills?.[owner]
  if (!skill || typeof skill.onCast !== 'function') return false
  const meta = ensureSkillMeta(skill)
  if (meta?.disabled) return false
  const fallbackCd = Number.isFinite(Number(skill.cooldownMs)) ? Math.max(0, Number(skill.cooldownMs)) : BLINK_SKILL_COOLDOWN_MS
  const out = invokeSkillHook(state, owner, skill, 'onCast', () => skill.onCast(createSkillApi(state, owner)))
  let ok = false
  let cooldownMs = fallbackCd
  if (typeof out === 'boolean') {
    ok = out
  } else if (out && typeof out === 'object') {
    ok = !!out.ok
    if (Number.isFinite(Number(out.cooldownMs))) cooldownMs = Math.max(0, Number(out.cooldownMs))
  }
  if (ok) {
    actor.skillCd = cooldownMs
    return true
  }
  return false
}

function stepSkillTicks(state, dt) {
  if (!state?.customSkills) return
  for (const owner of /** @type {const} */ (['p1', 'p2'])) {
    const skill = state.customSkills[owner]
    if (!skill?.onTick) continue
    const actor = owner === 'p1' ? state.player : state.ally
    if (!actor?.alive) continue
    invokeSkillHook(state, owner, skill, 'onTick', () => skill.onTick(createSkillApi(state, owner), dt))
  }
  dispatchSkillEvent(state, 'tick', { dt })
}

/**
 * 激光：可穿透所有墙体，并可一次贯穿多辆坦克。
 * 砖墙会被击碎；钢墙保持不变（但不再阻挡激光）。
 * @param {ReturnType<typeof createPlayState>} state
 */
function firePlayerLaser(state) {
  fireLaserByOwner(state, state.player, 'p1')
}

function fireAllyLaser(state) {
  fireLaserByOwner(state, state.ally, 'p2')
}

function fireLaserByOwner(state, shooter, owner) {
  const v = DIR_VEC[shooter.dir]
  let r = shooter.r + v.dr
  let c = shooter.c + v.dc
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
    state.laserFlash = null
    return
  }
  const fr = r
  const fc = c
  let endR = r
  let endC = c
  let guard = 0
  const maxSteps = COLS + ROWS + 4
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && guard++ < maxSteps) {
    const tile = state.walls[r][c]
    if (tile === TILE_BRICK) {
      state.walls[r][c] = 0
    }
    if (owner === 'p1' && state.ally?.alive && state.ally.r === r && state.ally.c === c) {
      state.ally.alive = false
    }
    if (owner === 'p2' && state.player.alive && state.player.r === r && state.player.c === c) {
      state.player.alive = false
    }
    for (const e of state.enemies) {
      if (e.alive && e.r === r && e.c === c) {
        applyEnemyDamage(e, LASER_DAMAGE, state)
      }
    }
    endR = r
    endC = c
    r += v.dr
    c += v.dc
  }
  state.laserFlash = { fr, fc, tr: endR, tc: endC, ms: LASER_FLASH_MS }
}

function stepCustomFx(state, dt) {
  if (!state.customFx) return
  state.customFx.shells = (state.customFx.shells || [])
    .map((s) => ({ ...s, ms: s.ms - dt }))
    .filter((s) => s.ms > 0)
  state.customFx.explosions = (state.customFx.explosions || [])
    .map((e) => (e.delayMs > 0 ? { ...e, delayMs: e.delayMs - dt } : { ...e, ms: e.ms - dt }))
    .filter((e) => e.delayMs > 0 || e.ms > 0)
  state.customFx.chainLasers = (state.customFx.chainLasers || [])
    .map((l) => (l.delayMs > 0 ? { ...l, delayMs: l.delayMs - dt } : { ...l, ms: l.ms - dt }))
    .filter((l) => l.delayMs > 0 || l.ms > 0)

  const nextHits = []
  for (const h of state.customFx.pendingHits || []) {
    const left = h.delayMs - dt
    if (left > 0) {
      nextHits.push({ ...h, delayMs: left })
      continue
    }
    for (let dr = -h.radius; dr <= h.radius; dr++) {
      for (let dc = -h.radius; dc <= h.radius; dc++) {
        const rr = h.r + dr
        const cc = h.c + dc
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
        const enemy = aliveEnemyAt(state, rr, cc)
        if (!enemy) continue
        if (h.kill) {
          enemy.hp = 0
          enemy.alive = false
        } else {
          applyEnemyDamage(enemy, h.damage)
        }
      }
    }
  }
  state.customFx.pendingHits = nextHits

  const nextLaserHits = []
  for (const h of state.customFx.pendingLaserHits || []) {
    const left = h.delayMs - dt
    if (left > 0) {
      nextLaserHits.push({ ...h, delayMs: left })
      continue
    }
    const enemy = h.target
    if (!enemy) continue
    if (!enemy.alive) continue
    if (h.kill) {
      enemy.hp = 0
      enemy.alive = false
      dispatchSkillEvent(state, 'enemyKilled', { enemy, by: 'chain-laser' })
    } else {
      applyEnemyDamage(enemy, h.damage, state)
    }
  }
  state.customFx.pendingLaserHits = nextLaserHits

  const alive = []
  for (const p of state.customProjectiles || []) {
    const v = DIR_VEC[p.dir] || { dr: 0, dc: 0 }
    const dist = (Number(p.speed) || 10) * (dt / 1000)
    const nx = p.x + v.dc * dist
    const ny = p.y + v.dr * dist
    const cellR = Math.round(ny)
    const cellC = Math.round(nx)
    const out = cellR < 0 || cellR >= ROWS || cellC < 0 || cellC >= COLS
    if (out) {
      continue
    }
    const bodyRadius = Math.max(0, Math.floor(Number(p.bodyRadius) || 0))
    const tileBlocked = !p.throughTiles && projectileTouchesTile(state, cellR, cellC, bodyRadius)
    const enemyHit = projectileTouchesEnemy(state, cellR, cellC, bodyRadius)
    if (!tileBlocked && !enemyHit) {
      p.x = nx
      p.y = ny
      alive.push(p)
      continue
    }
    const ir = Math.max(0, Math.min(ROWS - 1, cellR))
    const ic = Math.max(0, Math.min(COLS - 1, cellC))
    let nextHitRefs = Array.isArray(p.hitRefs) ? p.hitRefs : []
    if (enemyHit) {
      nextHitRefs = applyProjectileAoeDamage(state, p, ir, ic)
    }
    if (enemyHit && p.pierceEnemies) {
      p.x = nx
      p.y = ny
      p.hitRefs = nextHitRefs
      alive.push(p)
      continue
    }
    state.customFx.explosions.push({
      r: ir,
      c: ic,
      radius: p.radius || 1,
      ms: 220,
      dur: 220,
      delayMs: 0,
    })
    if (!enemyHit) applyProjectileAoeDamage(state, p, ir, ic)
    dispatchSkillEvent(state, 'projectileImpact', { r: ir, c: ic, projectile: p })
  }
  state.customProjectiles = alive
}

export function stepGame(state, dt, input) {
  state.skillCursor.p1 = sanitizeCursor(input?.cursor)
  state.skillCursor.p2 = sanitizeCursor(input?.p2?.cursor)
  stepCustomFx(state, dt)
  stepSkillTicks(state, dt)
  if (state.laserFlash) {
    state.laserFlash.ms -= dt
    if (state.laserFlash.ms <= 0) state.laserFlash = null
  }

  if (state.won || state.lost) return

  if (state.player.alive) {
    state.player.shootCd = Math.max(0, state.player.shootCd - dt)
    state.player.moveCd = Math.max(0, state.player.moveCd - dt)
    state.player.skillCd = Math.max(0, state.player.skillCd - dt)
    state.player.slideMs = Math.max(0, (state.player.slideMs || 0) - dt)
    if (input.toggleWeapon) {
      state.player.weapon = state.player.weapon === 'cannon' ? 'laser' : 'cannon'
    }
    if (input.useSkill && state.player.skillCd <= 0) {
      executeCustomSkill(state, 'p1')
    }
    if (input.turn) {
      state.player.dir = input.turn
    }
    if (input.move && state.player.moveCd <= 0) {
      if (tryMoveTank(state.player, state.walls, state, 'player', PLAYER_MOVE_MS)) {
        state.player.moveCd = PLAYER_MOVE_MS
      }
    }
    if (input.fire && state.player.shootCd <= 0) {
      const v = DIR_VEC[state.player.dir]
      const br = state.player.r + v.dr
      const bc = state.player.c + v.dc
      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
        if (state.player.weapon === 'laser') {
          firePlayerLaser(state)
          state.player.shootCd = LASER_COOLDOWN_MS
        } else {
          firePlayerBullet(state)
          state.player.shootCd = PLAYER_COOLDOWN_MS
        }
      }
    }
  }

  if (state.ally?.alive) {
    state.ally.shootCd = Math.max(0, state.ally.shootCd - dt)
    state.ally.moveCd = Math.max(0, state.ally.moveCd - dt)
    state.ally.skillCd = Math.max(0, (state.ally.skillCd || 0) - dt)
    state.ally.slideMs = Math.max(0, (state.ally.slideMs || 0) - dt)
    if (input.p2?.toggleWeapon) {
      state.ally.weapon = state.ally.weapon === 'cannon' ? 'laser' : 'cannon'
    }
    if (input.p2?.useSkill && state.ally.skillCd <= 0) {
      executeCustomSkill(state, 'p2')
    }
    if (input.p2?.turn) state.ally.dir = input.p2.turn
    if (input.p2?.move && state.ally.moveCd <= 0) {
      if (tryMoveTank(state.ally, state.walls, state, 'ally', PLAYER_MOVE_MS)) {
        state.ally.moveCd = PLAYER_MOVE_MS
      }
    }
    if (input.p2?.fire && state.ally.shootCd <= 0) {
      if (state.ally.weapon === 'laser') {
        fireAllyLaser(state)
        state.ally.shootCd = LASER_COOLDOWN_MS
      } else {
        fireBulletFrom(state, state.ally, 'p2')
        state.ally.shootCd = PLAYER_COOLDOWN_MS
      }
    }
  }

  for (const e of state.enemies) {
    if (!e.alive) continue
    e.shootCd -= dt
    e.moveCd -= dt
    e.slideMs = Math.max(0, (e.slideMs || 0) - dt)
    if (e.shootCd <= 0 && Math.random() < (e.shootChance || 0.015)) {
      const v = DIR_VEC[e.dir]
      const br = e.r + v.dr
      const bc = e.c + v.dc
      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
        state.bullets.push({ pr: br, pc: bc, dir: e.dir, owner: 'enemy' })
        const shootBase = e.shootBase || 640
        e.shootCd = shootBase * (0.75 + Math.random() * 0.55)
      }
    }
    if (e.moveCd <= 0) {
      const moveBase = e.moveBase || 440
      const nextMoveCd = moveBase * (0.7 + Math.random() * 0.65)
      e.moveCd = nextMoveCd
      const roll = Math.random()
      if (roll < 0.25) {
        const dirs = ['up', 'down', 'left', 'right']
        e.dir = /** @type {import('./constants.js').Dir} */ (dirs[Math.floor(Math.random() * 4)])
      } else if (roll < 0.55) {
        tryMoveTank(e, state.walls, state, e, nextMoveCd)
      } else {
        const dirs = ['up', 'down', 'left', 'right']
        e.dir = /** @type {import('./constants.js').Dir} */ (dirs[Math.floor(Math.random() * 4)])
        tryMoveTank(e, state.walls, state, e, nextMoveCd)
      }
    }
  }

  state.lastBulletTick += dt
  let bulletSteps = 0
  const maxBulletSteps = 80
  while (state.lastBulletTick >= BULLET_STEP_MS && bulletSteps++ < maxBulletSteps) {
    state.lastBulletTick -= BULLET_STEP_MS
    advanceBullets(state)
  }
  if (bulletSteps >= maxBulletSteps) {
    state.lastBulletTick = Math.min(state.lastBulletTick, BULLET_STEP_MS - 1)
  }

  if (!state.player.alive && !state.ally?.alive) state.lost = true
  if (state.enemies.length > 0 && state.enemies.every((e) => !e.alive)) state.won = true
}

function advanceBullets(state) {
  const next = []
  for (const b of state.bullets) {
    const v = DIR_VEC[b.dir]
    const r = b.pr + v.dr
    const c = b.pc + v.dc
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue
    const tile = state.walls[r][c]
    if (tile === TILE_BRICK) {
      state.walls[r][c] = 0
      continue
    }
    if (tile === TILE_STEEL) {
      continue
    }
    if (b.owner === 'p1' || b.owner === 'p2') {
      let hit = false
      for (const e of state.enemies) {
        if (e.alive && e.r === r && e.c === c) {
          applyEnemyDamage(e, CANNON_DAMAGE, state)
          hit = true
          break
        }
      }
      if (hit) continue
      if (b.owner === 'p1' && state.ally?.alive && state.ally.r === r && state.ally.c === c) {
        state.ally.alive = false
        continue
      }
      if (b.owner === 'p2' && state.player.alive && state.player.r === r && state.player.c === c) {
        state.player.alive = false
        continue
      }
    } else {
      if (state.player.alive && state.player.r === r && state.player.c === c) {
        state.player.alive = false
        continue
      }
      if (state.ally?.alive && state.ally.r === r && state.ally.c === c) {
        state.ally.alive = false
        continue
      }
    }
    next.push({ ...b, pr: r, pc: c })
  }
  state.bullets = next
}
