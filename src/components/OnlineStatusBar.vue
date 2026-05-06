<script setup>
defineProps({
  room: { type: Object, required: true },
  gameState: { type: Object, required: true },
})

function weaponText(w) {
  return w === 'laser' ? '激光炮' : '炮弹'
}
</script>

<template>
  <div class="status">
    <div class="chip">
      <strong>P1</strong>
      <span>{{ room.players[0]?.username || '空位' }}</span>
      <small v-if="gameState?.player">武器：{{ weaponText(gameState.player.weapon) }}</small>
    </div>
    <div class="chip">
      <strong>P2</strong>
      <span>{{ room.players[1]?.username || '空位' }}</span>
      <small v-if="gameState?.ally">武器：{{ weaponText(gameState.ally.weapon) }}</small>
    </div>
    <div class="chip">
      <strong>观战</strong>
      <span>{{ room.spectators?.length || 0 }} 人</span>
    </div>
  </div>
</template>

<style scoped>
.status {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.chip {
  min-width: 170px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.06);
  display: grid;
  gap: 2px;
}
</style>
