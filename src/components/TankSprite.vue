<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** @type {'player'|'enemy'} */
  variant: { type: String, required: true },
  /** @type {'up'|'down'|'left'|'right'} */
  dir: { type: String, required: true },
  size: { type: Number, default: 22 },
  /** 自定义贴图（建议炮口朝上）；为空则用内置矢量坦克 */
  imageSrc: { type: String, default: null },
})

const rotation = computed(() => {
  const m = { up: 0, right: 90, down: 180, left: -90 }
  return m[props.dir] ?? 0
})
</script>

<template>
  <div
    class="tank-root"
    :class="variant"
    :style="{
      width: size + 'px',
      height: size + 'px',
      transform: `rotate(${rotation}deg)`,
    }"
  >
    <img v-if="imageSrc" class="skin" :src="imageSrc" alt="" draggable="false" />
    <svg v-else class="vec" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="6" y="8" width="20" height="18" rx="3" :fill="variant === 'player' ? '#3d8b5c' : '#8b3a3a'" />
      <rect x="6" y="8" width="20" height="18" rx="3" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1" />
      <rect x="13" y="2" width="6" height="12" rx="1" fill="#2a2a2a" />
      <circle cx="16" cy="17" r="4" fill="#1e1e1e" stroke="rgba(255,255,255,.12)" stroke-width="0.5" />
      <rect x="4" y="14" width="4" height="6" rx="1" :fill="variant === 'player' ? '#2f6d47' : '#6d2f2f'" />
      <rect x="24" y="14" width="4" height="6" rx="1" :fill="variant === 'player' ? '#2f6d47' : '#6d2f2f'" />
    </svg>
  </div>
</template>

<style scoped>
.tank-root {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: 50% 50%;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
}
.skin {
  width: 88%;
  height: 88%;
  object-fit: contain;
  object-position: center bottom;
  image-rendering: auto;
}
.vec {
  width: 90%;
  height: 90%;
}
</style>
