const CONTROL_KEY = 'tank-battle-controls-v1'

/**
 * 本地键盘输入映射（后续可替换成网络输入源）
 */
export const DEFAULT_CONTROL_SCHEME = {
  p1: {
    up: ['w'],
    down: ['s'],
    left: ['a'],
    right: ['d'],
    fire: ['Space', 'j'],
    toggleWeapon: ['q'],
    skill: ['e'],
  },
  p2: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    fire: ['Enter', 'Numpad0'],
    toggleWeapon: ['u'],
    skill: ['i'],
  },
}

export const BIND_ACTIONS = [
  { id: 'p1.up', label: 'P1 上移' },
  { id: 'p1.down', label: 'P1 下移' },
  { id: 'p1.left', label: 'P1 左移' },
  { id: 'p1.right', label: 'P1 右移' },
  { id: 'p1.fire', label: 'P1 开火' },
  { id: 'p1.toggleWeapon', label: 'P1 切换武器' },
  { id: 'p1.skill', label: 'P1 技能' },
  { id: 'p2.up', label: 'P2 上移' },
  { id: 'p2.down', label: 'P2 下移' },
  { id: 'p2.left', label: 'P2 左移' },
  { id: 'p2.right', label: 'P2 右移' },
  { id: 'p2.fire', label: 'P2 开火' },
  { id: 'p2.toggleWeapon', label: 'P2 切换武器' },
  { id: 'p2.skill', label: 'P2 技能' },
]

export function normalizeKey(raw) {
  if (raw === ' ') return 'Space'
  if (typeof raw === 'string' && raw.length === 1) return raw.toLowerCase()
  return raw
}

function cloneControls(controls) {
  return {
    p1: { ...controls.p1, up: [...controls.p1.up], down: [...controls.p1.down], left: [...controls.p1.left], right: [...controls.p1.right], fire: [...controls.p1.fire], toggleWeapon: [...controls.p1.toggleWeapon], skill: [...controls.p1.skill] },
    p2: { ...controls.p2, up: [...controls.p2.up], down: [...controls.p2.down], left: [...controls.p2.left], right: [...controls.p2.right], fire: [...controls.p2.fire], toggleWeapon: [...controls.p2.toggleWeapon], skill: [...controls.p2.skill] },
  }
}

export function loadControlScheme() {
  try {
    const raw = localStorage.getItem(CONTROL_KEY)
    if (!raw) return cloneControls(DEFAULT_CONTROL_SCHEME)
    const parsed = JSON.parse(raw)
    const out = cloneControls(DEFAULT_CONTROL_SCHEME)
    for (const side of ['p1', 'p2']) {
      for (const key of ['up', 'down', 'left', 'right', 'fire', 'toggleWeapon', 'skill']) {
        const arr = parsed?.[side]?.[key]
        if (Array.isArray(arr) && arr.length > 0) {
          out[side][key] = arr.map((k) => normalizeKey(String(k)))
        }
      }
    }
    return out
  } catch {
    return cloneControls(DEFAULT_CONTROL_SCHEME)
  }
}

export function saveControlScheme(controls) {
  localStorage.setItem(CONTROL_KEY, JSON.stringify(controls))
}

function hasAny(keys, list) {
  return list.some((k) => keys.has(k))
}

export function getActionKeys(controls, actionId) {
  const [side, action] = actionId.split('.')
  return controls?.[side]?.[action] || []
}

export function setActionKeys(controls, actionId, keys) {
  const [side, action] = actionId.split('.')
  if (!controls?.[side]?.[action]) return controls
  const next = cloneControls(controls)
  const uniq = []
  for (const k of keys.map((v) => normalizeKey(v))) {
    if (!uniq.includes(k)) uniq.push(k)
  }
  next[side][action] = uniq.length > 0 ? uniq : [...DEFAULT_CONTROL_SCHEME[side][action]]
  return next
}

export function formatKey(key) {
  if (key === 'Space') return '空格'
  if (key === 'ArrowUp') return '↑'
  if (key === 'ArrowDown') return '↓'
  if (key === 'ArrowLeft') return '←'
  if (key === 'ArrowRight') return '→'
  if (key === 'Numpad0') return '小键盘0'
  return key.length === 1 ? key.toUpperCase() : key
}

export function formatKeyList(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return '未设置'
  return keys.map((k) => formatKey(k)).join(' / ')
}

export function isControlKey(controls, key) {
  const k = normalizeKey(key)
  for (const side of ['p1', 'p2']) {
    for (const action of ['up', 'down', 'left', 'right', 'fire', 'toggleWeapon', 'skill']) {
      if (controls?.[side]?.[action]?.includes(k)) return true
    }
  }
  return false
}

/**
 * @param {Set<string>} keys
 * @param {{ p1ToggleWeapon: boolean, p1UseSkill: boolean, p2ToggleWeapon: boolean, p2UseSkill: boolean }} pending
 * @param {ReturnType<typeof loadControlScheme>} controls
 */
export function buildLocalInput(keys, pending, controls) {
  const p1 = controls.p1
  const p2 = controls.p2
  const input = {
    turn: null,
    move: false,
    fire: false,
    toggleWeapon: pending.p1ToggleWeapon,
    useSkill: pending.p1UseSkill,
    p2: { turn: null, move: false, fire: false, toggleWeapon: pending.p2ToggleWeapon, useSkill: pending.p2UseSkill },
  }

  if (hasAny(keys, p1.up)) input.turn = 'up'
  else if (hasAny(keys, p1.down)) input.turn = 'down'
  else if (hasAny(keys, p1.left)) input.turn = 'left'
  else if (hasAny(keys, p1.right)) input.turn = 'right'
  input.fire = hasAny(keys, p1.fire)
  input.move = hasAny(keys, p1.up) || hasAny(keys, p1.down) || hasAny(keys, p1.left) || hasAny(keys, p1.right)

  if (hasAny(keys, p2.up)) input.p2.turn = 'up'
  else if (hasAny(keys, p2.down)) input.p2.turn = 'down'
  else if (hasAny(keys, p2.left)) input.p2.turn = 'left'
  else if (hasAny(keys, p2.right)) input.p2.turn = 'right'
  input.p2.move = hasAny(keys, p2.up) || hasAny(keys, p2.down) || hasAny(keys, p2.left) || hasAny(keys, p2.right)
  input.p2.fire = hasAny(keys, p2.fire)

  return input
}
