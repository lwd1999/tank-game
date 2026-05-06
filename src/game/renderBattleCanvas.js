import { TILE_BRICK, TILE_STEEL, TILE_BUSH } from './tiles.js'
import { DIR_VEC, BULLET_STEP_MS } from './constants.js'

/** @type {Record<string, number>} */
const DIR_ROT = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
}

const ENEMY_THEME = {
  scout: { fill: '#fb7185', stroke: '#9f1239', ring: 'rgba(251,113,133,0.7)', hp: '#fb7185' },
  assault: { fill: '#f59e0b', stroke: '#92400e', ring: 'rgba(245,158,11,0.7)', hp: '#f59e0b' },
  heavy: { fill: '#60a5fa', stroke: '#1d4ed8', ring: 'rgba(96,165,250,0.75)', hp: '#60a5fa' },
}

/**
 * 平滑插值曲线（S-curve）
 * @param {number} t 0..1
 */
function smoothStep(t) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

function getTankVisualPose(tank) {
  let vr = tank.r
  let vc = tank.c
  const slideMs = Number(tank.slideMs) || 0
  const slideDur = Number(tank.slideDur) || 0
  if (slideMs > 0 && slideDur > 0 && tank.slideDir && DIR_VEC[tank.slideDir]) {
    const p = smoothStep(slideMs / slideDur)
    const sv = DIR_VEC[tank.slideDir]
    vr -= sv.dr * p
    vc -= sv.dc * p
  }
  return { vr, vc }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} cell
 * @param {number} tile
 */
function drawTerrainCell(ctx, x, y, cell, tile) {
  if (tile === TILE_BRICK) {
    const g = ctx.createLinearGradient(x, y, x + cell, y + cell)
    g.addColorStop(0, '#986244')
    g.addColorStop(0.5, '#6b442b')
    g.addColorStop(1, '#3b2416')
    ctx.fillStyle = g
    ctx.fillRect(x, y, cell, cell)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    for (let i = 3; i < cell; i += 5) {
      ctx.beginPath()
      ctx.moveTo(x + i, y)
      ctx.lineTo(x + i, y + cell)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,230,200,0.16)'
    ctx.fillRect(x, y, cell, Math.max(2, cell * 0.18))
    return
  }
  if (tile === TILE_STEEL) {
    ctx.fillStyle = '#3f4650'
    ctx.fillRect(x, y, cell, cell)
    const hi = ctx.createLinearGradient(x, y, x + cell * 1.2, y + cell * 1.2)
    hi.addColorStop(0, 'rgba(255,255,255,0.18)')
    hi.addColorStop(0.42, 'rgba(255,255,255,0.04)')
    hi.addColorStop(1, 'rgba(0,0,0,0.18)')
    ctx.fillStyle = hi
    ctx.fillRect(x, y, cell, cell)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.moveTo(x + cell * 0.15, y + cell * 0.85)
    ctx.lineTo(x + cell * 0.85, y + cell * 0.15)
    ctx.stroke()
    return
  }
  if (tile === TILE_BUSH) {
    const g = ctx.createRadialGradient(
      x + cell * 0.35,
      y + cell * 0.32,
      cell * 0.08,
      x + cell * 0.55,
      y + cell * 0.55,
      cell * 0.65,
    )
    g.addColorStop(0, 'rgba(130, 220, 96, 0.62)')
    g.addColorStop(0.55, 'rgba(48, 122, 52, 0.78)')
    g.addColorStop(1, 'rgba(18, 40, 22, 0.9)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, cell, cell)
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} r
 * @param {number} c
 * @param {number} cell
 */
function drawBushVeil(ctx, r, c, cell) {
  const x = c * cell
  const y = r * cell
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  const g = ctx.createRadialGradient(
    x + cell * 0.38,
    y + cell * 0.38,
    0,
    x + cell * 0.52,
    y + cell * 0.52,
    cell * 0.72,
  )
  g.addColorStop(0, 'rgba(160, 255, 132, 0.2)')
  g.addColorStop(0.6, 'rgba(34, 92, 44, 0.56)')
  g.addColorStop(1, 'rgba(10, 35, 18, 0.68)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, cell, cell)
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ r: number, c: number, dir: string }} tank
 * @param {number} cell
 * @param {HTMLImageElement | null} img
 * @param {[string, string]} colors body stroke/fill hints
 */
function drawTank(ctx, tank, cell, img, colors) {
  const { vr, vc } = getTankVisualPose(tank)
  const cx = vc * cell + cell / 2
  const cy = vr * cell + cell / 2
  const sz = cell * 0.86
  const ang = DIR_ROT[tank.dir] ?? 0
  const ringColor = colors[2] || null
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(ang)
  if (img && img.complete && img.naturalWidth > 0) {
    try {
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz)
      if (ringColor) {
        ctx.strokeStyle = ringColor
        ctx.lineWidth = Math.max(1, cell * 0.06)
        roundRect(ctx, -sz * 0.43, -sz * 0.33, sz * 0.86, sz * 0.66, sz * 0.14)
        ctx.stroke()
      }
    } catch {
      /* decode error */
    }
  } else {
    const [fill, stroke] = colors
    ctx.fillStyle = fill
    roundRect(ctx, -sz * 0.38, -sz * 0.28, sz * 0.76, sz * 0.56, sz * 0.12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.42)'
    ctx.lineWidth = Math.max(1, cell * 0.035)
    ctx.stroke()
    ctx.fillStyle = '#161616'
    ctx.fillRect(-sz * 0.07, -sz * 0.46, sz * 0.14, sz * 0.26)
    ctx.fillStyle = stroke
    ctx.beginPath()
    ctx.arc(0, sz * 0.06, sz * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function getEnemyTheme(enemy) {
  return ENEMY_THEME[enemy.type] || ENEMY_THEME.assault
}

function drawEnemyHp(ctx, enemy, cell, color) {
  const maxHp = Math.max(1, enemy.maxHp || 1)
  const hp = Math.max(0, Math.min(maxHp, enemy.hp || 0))
  const { vr, vc } = getTankVisualPose(enemy)
  const x = vc * cell
  const y = vr * cell
  const w = cell * 0.8
  const h = Math.max(3, cell * 0.12)
  const sx = x + (cell - w) / 2
  const sy = y - h - Math.max(2, cell * 0.08)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, sx, sy, w, h, h / 2)
  ctx.fill()
  const fillW = (w - 2) * (hp / maxHp)
  ctx.fillStyle = color
  roundRect(ctx, sx + 1, sy + 1, Math.max(0, fillW), h - 2, (h - 2) / 2)
  ctx.fill()
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ pr: number, pc: number }} b
 * @param {number} cell
 */
function drawBullet(ctx, b, cell, lerp = 0) {
  const v = DIR_VEC[b.dir] || { dr: 0, dc: 0 }
  const cx = (b.pc + v.dc * lerp) * cell + cell / 2
  const cy = (b.pr + v.dr * lerp) * cell + cell / 2
  const rad = Math.max(2.2, cell * 0.13)
  const g = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.35, 0, cx, cy, rad)
  g.addColorStop(0, '#fffef5')
  g.addColorStop(0.45, '#fcd34d')
  g.addColorStop(1, '#b45309')
  ctx.save()
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, rad, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ fr: number, fc: number, tr: number, tc: number }} flash
 * @param {number} cell
 */
function drawLaser(ctx, flash, cell) {
  const x1 = flash.fc * cell + cell / 2
  const y1 = flash.fr * cell + cell / 2
  const x2 = flash.tc * cell + cell / 2
  const y2 = flash.tr * cell + cell / 2
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(16, 255, 220, 0.3)'
  ctx.lineWidth = Math.max(5, cell * 0.25)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(220, 255, 250, 0.98)'
  ctx.lineWidth = Math.max(1.8, cell * 0.085)
  ctx.stroke()
  ctx.restore()
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {{
 *   cell: number
 *   cols: number
 *   rows: number
 *   bg: HTMLImageElement | null
 *   player: HTMLImageElement | null
 *   enemy: HTMLImageElement | null
 *   bgMask?: number
 * }} opts
 */
export function drawBattlefield(ctx, state, opts) {
  const { cell, cols, rows, bg, player: pImg, enemy: eImg } = opts
  const bgMask = Math.max(0, Math.min(0.7, Number(opts.bgMask) || 0.22))
  const w = cols * cell
  const h = rows * cell

  if (bg && bg.complete && bg.naturalWidth > 0) {
    try {
      ctx.drawImage(bg, 0, 0, w, h)
    } catch {
      /* ignore */
    }
    const veil = ctx.createLinearGradient(0, 0, 0, h)
    veil.addColorStop(0, `rgba(6, 10, 8, ${bgMask + 0.04})`)
    veil.addColorStop(1, `rgba(6, 10, 8, ${bgMask})`)
    ctx.fillStyle = veil
    ctx.fillRect(0, 0, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#1a2d24')
    g.addColorStop(0.45, '#111c17')
    g.addColorStop(1, '#070c09')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.14, w / 2, h / 2, Math.max(w, h) * 0.62)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.48)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  const glow = ctx.createRadialGradient(w * 0.55, h * 0.35, 0, w * 0.55, h * 0.35, Math.max(w, h) * 0.48)
  glow.addColorStop(0, 'rgba(60, 220, 170, 0.11)')
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = state.walls[r][c]
      if (t) {
        drawTerrainCell(ctx, c * cell, r * cell, cell, t)
      }
    }
  }

  if (state.player.alive) {
    drawTank(ctx, state.player, cell, pImg, ['#34d399', '#047857'])
  }
  if (state.ally?.alive) {
    drawTank(ctx, state.ally, cell, pImg, ['#60a5fa', '#1d4ed8', 'rgba(96,165,250,0.72)'])
  }
  for (const e of state.enemies) {
    if (e.alive) {
      const theme = getEnemyTheme(e)
      drawTank(ctx, e, cell, eImg, [theme.fill, theme.stroke, theme.ring])
      drawEnemyHp(ctx, e, cell, theme.hp)
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (state.walls[r][c] === TILE_BUSH) {
        drawBushVeil(ctx, r, c, cell)
      }
    }
  }

  for (const b of state.bullets) {
    const lerp = Math.max(0, Math.min(1, (state.lastBulletTick || 0) / BULLET_STEP_MS))
    drawBullet(ctx, b, cell, lerp)
  }

  if (state.laserFlash && state.laserFlash.ms > 0) {
    drawLaser(ctx, state.laserFlash, cell)
  }

  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
  ctx.restore()
}
