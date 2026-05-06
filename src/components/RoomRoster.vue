<script setup>
defineProps({
  room: { type: Object, required: true },
  selfId: { type: String, default: '' },
})

function isOwner(room, id) {
  return room.ownerId === id
}
</script>

<template>
  <section class="roster">
    <h3>房间成员</h3>
    <div class="cols">
      <div class="col">
        <h4>上场席</h4>
        <ul class="list">
          <li v-for="p in room.players" :key="p.userId" class="item player" :class="{ me: p.userId === selfId }">
            <div class="line1">
              <strong>{{ p.username }}</strong>
              <span class="slot">P{{ p.slot + 1 }}</span>
            </div>
            <div class="badges">
              <span v-if="isOwner(room, p.userId)" class="badge owner">房主</span>
              <span class="badge" :class="p.ready ? 'ok' : 'wait'">{{ p.ready ? '已准备' : '未准备' }}</span>
              <span class="badge" :class="p.connected ? 'ok' : 'offline'">{{ p.connected ? '在线' : '离线' }}</span>
              <span v-if="p.userId === selfId" class="badge me">我</span>
            </div>
          </li>
          <li v-if="room.players.length === 0" class="item empty">暂无上场玩家</li>
        </ul>
      </div>
      <div class="col">
        <h4>观战席</h4>
        <ul class="list">
          <li v-for="s in room.spectators" :key="s.userId" class="item spectator" :class="{ me: s.userId === selfId }">
            <div class="line1">
              <strong>{{ s.username }}</strong>
            </div>
            <div class="badges">
              <span v-if="isOwner(room, s.userId)" class="badge owner">房主</span>
              <span class="badge watch">观战</span>
              <span v-if="s.userId === selfId" class="badge me">我</span>
            </div>
          </li>
          <li v-if="room.spectators.length === 0" class="item empty">暂无观战</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roster {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    radial-gradient(130% 120% at 100% 0%, rgba(59, 130, 246, 0.12), transparent 55%),
    rgba(10, 15, 14, 0.76);
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
h3,
h4 {
  margin: 0 0 10px;
}
.col {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.item {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
}
.item.player {
  border-color: rgba(34, 197, 94, 0.25);
}
.item.spectator {
  border-color: rgba(59, 130, 246, 0.25);
}
.item.me {
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.45);
}
.item.empty {
  opacity: 0.72;
}
.line1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.slot {
  font-size: 0.78rem;
  opacity: 0.8;
}
.badges {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.badge {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 0.72rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.badge.owner {
  border-color: rgba(245, 158, 11, 0.5);
  color: #fde68a;
}
.badge.ok {
  border-color: rgba(16, 185, 129, 0.5);
  color: #6ee7b7;
}
.badge.wait {
  border-color: rgba(244, 63, 94, 0.5);
  color: #fda4af;
}
.badge.offline {
  border-color: rgba(148, 163, 184, 0.55);
  color: #cbd5e1;
}
.badge.watch {
  border-color: rgba(96, 165, 250, 0.55);
  color: #93c5fd;
}
.badge.me {
  border-color: rgba(250, 204, 21, 0.55);
  color: #fde047;
}
</style>
