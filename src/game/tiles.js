/** 空地 */
export const TILE_EMPTY = 0
/** 砖墙，可被炮弹打掉 */
export const TILE_BRICK = 1
/** 钢墙，炮弹无法破坏 */
export const TILE_STEEL = 2
/** 草丛，可通行，炮弹可穿过，用于遮挡视觉 */
export const TILE_BUSH = 3

/**
 * @param {number} t
 * @returns {boolean}
 */
export function isSolidTile(t) {
  return t === TILE_BRICK || t === TILE_STEEL
}

/**
 * @param {number} t
 * @returns {string}
 */
export function tileClassSuffix(t) {
  if (t === TILE_BRICK) return 'brick'
  if (t === TILE_STEEL) return 'steel'
  if (t === TILE_BUSH) return 'bush'
  return 'empty'
}
