<script setup>
defineProps({
  rooms: { type: Array, default: () => [] },
  user: { type: Object, required: true },
})

const emit = defineEmits(['create', 'match', 'join', 'logout', 'back'])
</script>

<template>
  <section class="lobby">
    <header class="top">
      <div>
        <h2>联机大厅</h2>
        <p>当前用户：{{ user.username }}</p>
      </div>
      <div class="actions">
        <button type="button" @click="emit('back')">回首页</button>
        <button type="button" @click="emit('logout')">退出登录</button>
      </div>
    </header>
    <div class="ops">
      <button type="button" class="primary" @click="emit('match')">快速匹配</button>
      <button type="button" @click="emit('create')">创建房间</button>
    </div>
    <ul class="rooms">
      <li v-for="r in rooms" :key="r.id">
        <div>
          <strong>{{ r.code }}</strong>
          <p>玩家 {{ r.players.length }}/{{ r.activeSlots }} · 观战 {{ r.spectators.length }} · {{ r.status }}</p>
        </div>
        <button type="button" @click="emit('join', r.id)">进入</button>
      </li>
      <li v-if="rooms.length === 0">暂无房间，试试快速匹配</li>
    </ul>
  </section>
</template>

<style scoped>
.lobby {
  display: grid;
  gap: 12px;
}
.top,
.ops,
li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.ops {
  justify-content: flex-start;
}
.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
li {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
}
p {
  margin: 4px 0 0;
  opacity: 0.75;
}
button {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  padding: 8px 10px;
}
.primary {
  background: linear-gradient(145deg, #10b981, #059669);
  color: #052e1a;
}
</style>
