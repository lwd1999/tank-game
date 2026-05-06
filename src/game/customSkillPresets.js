export const SKILL_CODE_TEMPLATE = `({
  // 主动施放：按技能键触发
  onCast(api) {
    // 返回 { ok: boolean, cooldownMs?: number }
    return { ok: false }
  },

  // 每帧回调（可选）
  onTick(api, dt) {
    // dt: 毫秒
  },

  // 事件回调（可选）
  // event: 'tick' | 'enemyKilled' | 'projectileImpact'
  onEvent(api, event, payload) {},
})`

export const SKILL_PRESETS = [
  {
    id: 'none',
    label: '不装配技能',
    name: '未装配',
    cooldownMs: 0,
    source: SKILL_CODE_TEMPLATE,
  },
  {
    id: 'blink-kill',
    label: '瞬移打击（秒杀锁定目标）',
    name: '瞬移打击',
    cooldownMs: 3200,
    source: `({
  onCast(api) {
    const ok = api.blinkStrike({
      range: 5,
      killLocked: true,
      fireAfterTeleport: true,
    })
    return { ok, cooldownMs: 3200 }
  },
})`,
  },
  {
    id: 'heavy-shell-aoe',
    label: '巨炮弹（5x5爆炸）',
    name: '巨炮弹',
    cooldownMs: 3500,
    source: `({
  onCast(api) {
    const ok = api.fireHeavyShell({
      radius: 2,
      kill: true,
      travelMs: 280,
    })
    return { ok, cooldownMs: 3500 }
  },
})`,
  },
  {
    id: 'giant-cannon-pierce',
    label: '巨炮贯穿（3x3，不消失）',
    name: '巨炮贯穿',
    cooldownMs: 2600,
    source: `({
  onCast(api) {
    const ok = api.spawnProjectile({
      // 3x3 命中范围
      radius: 1,
      // 普通炮弹等效速度：每 45ms 前进 1 格 ≈ 22.22 格/秒
      speed: 1000 / 45,
      damage: 3,
      size: 0.42,
      color: '#f97316',
      // 命中敌人不销毁，继续飞行
      pierceEnemies: true,
      // 无视地形阻挡，直到飞出地图
      throughTiles: true,
    })
    return { ok, cooldownMs: 2600 }
  },
})`,
  },
  {
    id: 'steel-wall-3x3',
    label: '钢墙矩阵（鼠标3x3）',
    name: '钢墙矩阵',
    cooldownMs: 2400,
    source: `({
  onCast(api) {
    const p = api.getCursor()
    if (!p) return { ok: false }
    let placed = 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (api.setTile(p.r + dr, p.c + dc, 2, { onOccupied: 'kill' })) placed++
      }
    }
    return { ok: placed > 0, cooldownMs: 2400 }
  },
})`,
  },
  {
    id: 'chain-winding-laser',
    label: '蜿蜒索敌激光（三杀消散）',
    name: '蜿蜒索敌激光',
    cooldownMs: 3200,
    source: `({
  onCast(api) {
    const ok = api.castChainLaser({
      maxLinks: 3,
      range: 16,
      hopRange: 12,
      // 每次跳转间隔，调慢以便看清路径
      hopDelayMs: 360,
      // 每段激光在屏幕停留时长
      segmentMs: 420,
      kill: true,
      color: '#7dd3fc',
    })
    return { ok, cooldownMs: 3200 }
  },
})`,
  },
  {
    id: 'tactical-hacker',
    label: '战术改写（改地图+刷弹体）',
    name: '战术改写',
    cooldownMs: 2200,
    source: `({
  onCast(api) {
    const enemy = api.findNearestEnemy(8)
    if (enemy) {
      // 在目标脚下写入灌木地形，制造遮挡
      api.setTile(enemy.r, enemy.c, 3)
    }
    const ok = api.spawnProjectile({
      damage: 3,
      radius: 1,
      speed: 13,
      color: '#22d3ee',
      size: 0.18,
    })
    return { ok, cooldownMs: 2200 }
  },
  onEvent(api, event, payload) {
    if (event === 'projectileImpact') {
      // 爆点附近如果空地，补 1 个突击敌人演示刷怪
      const r = payload?.r
      const c = payload?.c
      if (typeof r === 'number' && typeof c === 'number') {
        api.spawnEnemy({ r: r + 1, c, type: 'assault', dir: 'up' })
      }
    }
  },
})`,
  },
]

export function compileSkillSource(source) {
  const text = String(source || '').trim()
  if (!text) throw new Error('技能代码为空')
  const mod = new Function(`"use strict"; return (${text});`)()
  if (typeof mod === 'function') {
    return { onCast: mod }
  }
  if (!mod || typeof mod !== 'object') {
    throw new Error('技能代码必须是函数或对象')
  }
  if (mod.onCast && typeof mod.onCast !== 'function') throw new Error('onCast 必须是函数')
  if (mod.onTick && typeof mod.onTick !== 'function') throw new Error('onTick 必须是函数')
  if (mod.onEvent && typeof mod.onEvent !== 'function') throw new Error('onEvent 必须是函数')
  if (mod.onEquip && typeof mod.onEquip !== 'function') throw new Error('onEquip 必须是函数')
  if (mod.onUnequip && typeof mod.onUnequip !== 'function') throw new Error('onUnequip 必须是函数')
  return mod
}
