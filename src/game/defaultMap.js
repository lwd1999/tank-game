import { COLS, ROWS } from './constants.js'
import { TILE_BRICK, TILE_STEEL } from './tiles.js'

/** @returns {{ walls: number[][], playerSpawns: { r: number, c: number }[], enemies: { r: number, c: number, type: 'scout'|'assault'|'heavy' }[] }} */
export function createEmptyWalls() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0))
}

/** 边框钢墙 + 中间砖块障碍 */
export function createDefaultMap() {
  const walls = createEmptyWalls()
  for (let c = 0; c < COLS; c++) {
    walls[0][c] = TILE_STEEL
    walls[ROWS - 1][c] = TILE_STEEL
  }
  for (let r = 0; r < ROWS; r++) {
    walls[r][0] = TILE_STEEL
    walls[r][COLS - 1] = TILE_STEEL
  }
  const blocks = [
    [8, 8],
    [8, 9],
    [8, 17],
    [8, 18],
    [12, 10],
    [12, 11],
    [12, 15],
    [12, 16],
    [16, 8],
    [16, 9],
    [16, 17],
    [16, 18],
  ]
  for (const [r, c] of blocks) {
    if (r < ROWS && c < COLS) walls[r][c] = TILE_BRICK
  }
  const center = Math.floor(COLS / 2)
  const playerSpawns = [
    { r: ROWS - 3, c: center - 1 },
    { r: ROWS - 3, c: center + 1 },
  ]
  const enemies = [
    { r: 3, c: 5, type: 'scout' },
    { r: 3, c: 13, type: 'assault' },
    { r: 3, c: 20, type: 'heavy' },
    { r: 5, c: 10, type: 'assault' },
  ]
  return { walls, playerSpawns, enemies }
}
