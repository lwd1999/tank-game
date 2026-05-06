export const COLS = 26
export const ROWS = 26
/** 编辑器等处的默认格宽；游玩模式会按视口单独放大 */
export const CELL = 28
export const STORAGE_KEY = 'tank-battle-custom-map-v2'
export const STORAGE_KEY_LEGACY = 'tank-battle-custom-map-v1'

/** @typedef {'up'|'down'|'left'|'right'} Dir */

export const DIRS = ['up', 'down', 'left', 'right']

export const DIR_VEC = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
}

export const PLAYER_COOLDOWN_MS = 200
/** 略短，连续移动更跟手 */
export const PLAYER_MOVE_MS = 105
export const ENEMY_MOVE_MS = 400
export const BULLET_STEP_MS = 45
/** 激光炮冷却（玩家） */
export const LASER_COOLDOWN_MS = 720
/** 激光束残留在屏幕上的时间（仅表现） */
export const LASER_FLASH_MS = 200
/** 瞬移突袭技能范围（曼哈顿距离） */
export const BLINK_SKILL_RANGE = 5
/** 瞬移突袭冷却 */
export const BLINK_SKILL_COOLDOWN_MS = 3200
