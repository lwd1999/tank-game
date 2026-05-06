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
  }
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

function applyEnemyDamage(enemy, dmg) {
  if (!enemy.alive) return
  enemy.hp = Math.max(0, (enemy.hp ?? 1) - dmg)
  if (enemy.hp <= 0) enemy.alive = false
}

function canTeleportTo(state, r, c) {
  if (!insideInner(r, c)) return false
  if (isSolidTile(state.walls[r][c])) return false
  if (tankAt(state, r, c, 'player')) return false
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
      applyEnemyDamage(target, CANNON_DAMAGE)
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

function tryBlinkStrikeByOwner(state, owner) {
  const actor = owner === 'p1' ? state.player : state.ally
  if (!actor?.alive) return false
  const selfIgnore = owner === 'p1' ? 'player' : 'ally'
  /** @type {null | { r: number, c: number, dir: import('./constants.js').Dir, dist: number, enemyRef: any }} */
  let nearest = null
  for (const e of state.enemies) {
    if (!e.alive) continue
    const dist = Math.abs(e.r - actor.r) + Math.abs(e.c - actor.c)
    if (dist > BLINK_SKILL_RANGE) continue
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

  let pos = candidates.find((p) => canTeleportTo(state, p.r, p.c))
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
    pos = around.find((p) => canTeleportTo(state, p.r, p.c))
  }
  if (!pos) return false

  if (tankAt(state, pos.r, pos.c, selfIgnore)) return false
  actor.r = pos.r
  actor.c = pos.c
  actor.slideMs = 0
  actor.dir = faceTarget(pos, nearest)
  // 技能锁定目标直接处决（无视剩余血量）
  nearest.enemyRef.hp = 0
  nearest.enemyRef.alive = false
  if (owner === 'p1') firePlayerBullet(state)
  else fireAllyBullet(state)
  actor.skillCd = BLINK_SKILL_COOLDOWN_MS
  return true
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
        applyEnemyDamage(e, LASER_DAMAGE)
      }
    }
    endR = r
    endC = c
    r += v.dr
    c += v.dc
  }
  state.laserFlash = { fr, fc, tr: endR, tc: endC, ms: LASER_FLASH_MS }
}

export function stepGame(state, dt, input) {
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
      tryBlinkStrikeByOwner(state, 'p1')
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
      tryBlinkStrikeByOwner(state, 'p2')
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
          applyEnemyDamage(e, CANNON_DAMAGE)
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
