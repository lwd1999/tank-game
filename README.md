# tank-game

坦克小游戏（Vue 3 + Vite + Node 联机服务）。

## 游戏介绍

`tank-game` 是一个支持单机与联机的 2D 坦克对战项目，核心体验是：

- **即时战斗**：双坦克移动、开火、切换武器（炮弹/激光）与技能释放。
- **可编辑地图**：可视化编辑砖墙、钢墙、草丛、出生点和敌方单位。
- **联机房间**：创建房间、准备开局、实时同步战局与对战状态。
- **技能工坊**：运行时装配自定义技能代码（单机与联机均可），支持热更新。

你可以把它理解为一个“可玩 + 可改 + 可扩展”的坦克战斗沙盒：
既能直接玩，也能写技能脚本做玩法实验。

## 核心玩法

- **基础操作**：移动、射击、武器切换、技能键施放。
- **战斗机制**：
  - 普通炮弹与激光炮（激光可穿透并对多目标生效）
  - 友伤规则（P1/P2 可互相命中）
  - 敌方单位分轻型/突击/重型，血量与行为不同
- **地图策略**：
  - 砖墙可破坏，钢墙坚固，草丛可遮挡视野表现
  - 多出生点支持（适配双玩家开局）

## 联机模式说明

- 房间制联机，服务端权威同步（客户端发送输入，服务端推进状态）。
- 支持 1~2 名上场玩家 + 观战席。
- 开局前有同步倒计时，确保双方在同一战斗节奏中进入对局。
- 支持对局内实时同步技能代码（不退出战局即可更新）。

## 为什么这个项目有意思

- **对玩家**：可以直接体验“坦克对战 + 技能搭配 + 地图博弈”。
- **对开发者**：可以快速验证“脚本化技能系统”和联机同步方案。
- **对玩法设计**：可以用技能工坊做高自由度技能原型（控制、位移、地形、弹道）。

## 开发

- 前端：`npm run dev`
- 后端：`npm run dev:server`
- 前后端同时：`npm run dev:all`

## 构建

- 前端生产包：`npm run build`

## 自定义技能（完整 API + 设计说明）

### 使用入口

- 单机：对局右侧 `技能工坊`
- 联机：房间页 `联机技能工坊`（上场玩家配置自己的技能）

### 技能代码形态

- 函数形态（等价 `onCast`）：
  - `(api) => ({ ok: true, cooldownMs: 2000 })`
- 对象形态（推荐）：
  - `{ onCast, onTick, onEvent, onEquip, onUnequip }`

### 生命周期 Hooks

| Hook        | 触发时机         | 参数                    | 返回值                             | 说明                                                  |
| ----------- | ---------------- | ----------------------- | ---------------------------------- | ----------------------------------------------------- |
| `onCast`    | 按技能键时       | `(api)`                 | `boolean` 或 `{ ok, cooldownMs? }` | 主动施放入口；`ok=true` 才进入冷却                    |
| `onTick`    | 每帧             | `(api, dt)`             | 无                                 | 持续型技能逻辑；`dt` 单位毫秒                         |
| `onEvent`   | 事件触发         | `(api, event, payload)` | 无                                 | 当前事件：`tick` / `enemyKilled` / `projectileImpact` |
| `onEquip`   | 技能装配时       | `(api)`                 | 无                                 | 初始化状态、缓存等                                    |
| `onUnequip` | 技能卸载或替换时 | `(api)`                 | 无                                 | 清理状态、回收资源等                                  |

### API 参考（当前全部接口）

| 类别      | API                                   | 参数                    | 返回值             | 说明 / 边界                                      |
| --------- | ------------------------------------- | ----------------------- | ------------------ | ------------------------------------------------ |
| 上下文    | `api.owner`                           | -                       | `'p1' \| 'p2'`     | 当前施法归属                                     |
| 上下文    | `api.self`                            | -                       | `Tank`             | 当前施法者对象（位置、朝向、冷却等）             |
| 上下文    | `api.state`                           | -                       | `GameState`        | 当前战局状态（高级用法）                         |
| 光标/地图 | `api.getCursor()`                     | -                       | `{ r, c } \| null` | 当前鼠标格子；无有效光标返回 `null`              |
| 光标/地图 | `api.getTile(r, c)`                   | 行列坐标                | `number \| null`   | 读取地形；越界返回 `null`                        |
| 光标/地图 | `api.setTile(r, c, tile, options?)`   | `tile` + `onOccupied`   | `boolean`          | 仅内圈可改；占位策略：`skip`(默认)/`kill`/`push` |
| 目标/位移 | `api.listEnemies()`                   | -                       | `Enemy[]`          | 仅返回存活敌人                                   |
| 目标/位移 | `api.findNearestEnemy(range=5)`       | 搜索半径                | `Enemy \| null`    | 曼哈顿距离最近目标                               |
| 目标/位移 | `api.canTeleport(r, c)`               | 行列坐标                | `boolean`          | 检查可瞬移（不可进阻挡格/占位格）                |
| 目标/位移 | `api.teleportTo(r, c)`                | 行列坐标                | `boolean`          | 执行瞬移，失败返回 `false`                       |
| 目标/位移 | `api.faceTarget(target)`              | `{ r, c }`              | `void`             | 让自身朝向目标                                   |
| 武器/弹体 | `api.fireBullet()`                    | -                       | `void`             | 普通炮弹                                         |
| 武器/弹体 | `api.fireLaser()`                     | -                       | `void`             | 激光炮（穿透）                                   |
| 武器/弹体 | `api.fireHeavyShell(options?)`        | 半径/伤害/秒杀/飞行时间 | `boolean`          | 触发重炮飞行与爆炸表现                           |
| 武器/弹体 | `api.spawnProjectile(options?)`       | 见下表                  | `boolean`          | 生成自定义弹体（支持穿敌/穿墙/占格）             |
| 武器/弹体 | `api.castChainLaser(options?)`        | 见下表                  | `boolean`          | 生成蜿蜒连锁激光，并按跳跃延迟逐段命中           |
| 单位      | `api.spawnEnemy({ r, c, type, dir })` | 位置+类型+朝向          | `boolean`          | 只在可放置空位生效；`type`=`scout/assault/heavy` |
| 单位      | `api.damageEnemy(enemy, dmg=1)`       | 敌人对象+伤害           | `void`             | 造成伤害并触发击杀事件                           |
| 单位      | `api.killEnemy(enemy)`                | 敌人对象                | `void`             | 直接击破并触发击杀事件                           |
| 复合      | `api.blinkStrike(options?)`           | 范围/秒杀/补射          | `boolean`          | 内置瞬移打击流程                                 |

#### `spawnProjectile(options)` 参数

| 参数            | 类型      | 默认    | 说明                                  |
| --------------- | --------- | ------- | ------------------------------------- |
| `speed`         | `number`  | `10`    | 速度（格/秒）                         |
| `damage`        | `number`  | `2`     | 命中伤害                              |
| `radius`        | `number`  | `1`     | 命中半径（`1` => 3x3）                |
| `bodyRadius`    | `number`  | `0`     | 飞行体占格半径（`1` => 3x3 实体弹体） |
| `pierceEnemies` | `boolean` | `false` | 命中敌人后是否继续飞行                |
| `throughTiles`  | `boolean` | `false` | 是否无视地形直到出界                  |
| `kill`          | `boolean` | `false` | 命中时是否直接秒杀                    |
| `size`          | `number`  | `0.16`  | 渲染尺寸系数（视觉）                  |
| `color`         | `string`  | 橙色    | 渲染颜色（视觉）                      |

#### `castChainLaser(options)` 参数

| 参数         | 类型      | 默认      | 说明                                           |
| ------------ | --------- | --------- | ---------------------------------------------- |
| `maxLinks`   | `number`  | `3`       | 最多连锁目标数（例如 3 表示最多击中 3 个目标） |
| `range`      | `number`  | `14`      | 第一跳索敌范围（从施法者出发）                 |
| `hopRange`   | `number`  | `10`      | 后续每一跳索敌范围（从上一目标出发）           |
| `hopDelayMs` | `number`  | `220`     | 每一跳间隔，越大越慢、路径越清楚               |
| `segmentMs`  | `number`  | `280`     | 每段激光在屏幕上的可视停留时长                 |
| `damage`     | `number`  | `2`       | 每一跳伤害（`kill=false` 时生效）              |
| `kill`       | `boolean` | `true`    | 每一跳是否直接击杀目标                         |
| `color`      | `string`  | `#67e8f9` | 蜿蜒激光颜色                                   |

### 设计说明（为什么这么设计）

- **能力白名单（Capability API）**
  - 脚本只能通过 `api` 操作战局，而不是直接任意改引擎内部，避免高风险脚本破坏核心逻辑。
- **统一返回语义**
  - `onCast` 通过 `ok` 明确“本次是否生效”，并把冷却控制放在返回值，便于做可控失败（如没目标/没光标）。
- **事件驱动 + 每帧回调并存**
  - `onTick` 适合持续技能，`onEvent` 适合命中触发/击杀触发，减少脚本复杂分支。
- **联机与单机一致**
  - 同一套技能脚本 API 在单机和联机共用，降低玩法开发和调试成本。
- **边界优先**
  - `setTile` 的 `onOccupied`、地图内圈限制、弹体可配置阻挡策略，都是为了把“边界行为”变成显式、可预期的规则。
- **运行时容错（防写崩）**
  - 技能 hook 抛错会被引擎捕获，不会中断主循环；连续错误达到阈值后该技能会自动熔断停用，避免拖垮整局。

### 示例 1：瞬移打击（秒杀锁定目标）

```js
({
  onCast(api) {
    const ok = api.blinkStrike({
      range: 5,
      killLocked: true,
      fireAfterTeleport: true,
    });
    return { ok, cooldownMs: 3200 };
  },
});
```

### 示例 2：3x3 巨炮贯穿

```js
({
  onCast(api) {
    const ok = api.spawnProjectile({
      radius: 1,
      bodyRadius: 1,
      speed: 1000 / 45,
      damage: 3,
      size: 1.5,
      color: "#f97316",
      pierceEnemies: true,
      throughTiles: true,
    });
    return { ok, cooldownMs: 2600 };
  },
});
```

### 示例 3：鼠标 3x3 钢墙（占位即击破）

```js
({
  onCast(api) {
    const p = api.getCursor();
    if (!p) return { ok: false };
    let placed = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (api.setTile(p.r + dr, p.c + dc, 2, { onOccupied: "kill" }))
          placed++;
      }
    }
    return { ok: placed > 0, cooldownMs: 2400 };
  },
});
```

### 示例 4：蜿蜒索敌激光（三杀后结束）

```js
({
  onCast(api) {
    const ok = api.castChainLaser({
      maxLinks: 3,
      range: 16,
      hopRange: 12,
      hopDelayMs: 360,
      segmentMs: 420,
      kill: true,
      color: "#7dd3fc",
    });
    return { ok, cooldownMs: 3200 };
  },
});
```
