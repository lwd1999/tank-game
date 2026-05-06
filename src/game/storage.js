import { STORAGE_KEY, STORAGE_KEY_LEGACY, COLS, ROWS } from './constants.js'
import { createDefaultMap } from './defaultMap.js'
import { TILE_BRICK, TILE_STEEL } from './tiles.js'

/**
 * @param {number[][]} walls
 * @returns {number[][]}
 */
function migrateV1WallsToV2(walls) {
  const out = walls.map((row) => [...row])
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const edge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1
      const v = out[r][c]
      if (edge && v === TILE_BRICK) out[r][c] = TILE_STEEL
    }
  }
  return out
}

/**
 * @param {{ walls: number[][], playerSpawns: { r: number, c: number }[], enemies: { r: number, c: number, type?: 'scout'|'assault'|'heavy' }[] }} data
 */
export function saveCustomMap(data) {
  const playerSpawns = Array.isArray(data.playerSpawns) ? data.playerSpawns.map((s) => ({ r: s.r, c: s.c })) : []
  const payload = {
    version: 3,
    walls: data.walls.map((row) => [...row]),
    playerSpawns,
    enemies: data.enemies.map((e) => ({ r: e.r, c: e.c, type: e.type || 'assault' })),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/** @returns {{ walls: number[][], playerSpawns: { r: number, c: number }[], enemies: { r: number, c: number, type: 'scout'|'assault'|'heavy' }[] }} */
export function loadCustomMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && Array.isArray(o.walls) && Array.isArray(o.enemies)) {
        const playerSpawns = Array.isArray(o.playerSpawns)
          ? o.playerSpawns.filter((s) => Number.isFinite(s?.r) && Number.isFinite(s?.c)).map((s) => ({ r: s.r, c: s.c }))
          : o.playerSpawn && Number.isFinite(o.playerSpawn.r) && Number.isFinite(o.playerSpawn.c)
            ? [{ r: o.playerSpawn.r, c: o.playerSpawn.c }]
            : []
        return {
          walls: o.walls,
          playerSpawns,
          enemies: o.enemies.map((e) => ({ r: e.r, c: e.c, type: e.type || 'assault' })),
        }
      }
    }
    const leg = localStorage.getItem(STORAGE_KEY_LEGACY)
    if (leg) {
      const o = JSON.parse(leg)
      if (o && Array.isArray(o.walls) && Array.isArray(o.enemies)) {
        const walls = migrateV1WallsToV2(o.walls)
        return { walls, playerSpawns: [], enemies: o.enemies.map((e) => ({ r: e.r, c: e.c, type: 'assault' })) }
      }
    }
    return createDefaultMap()
  } catch {
    return createDefaultMap()
  }
}

export function resetToDefault() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STORAGE_KEY_LEGACY)
}
