<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      fire: 'Enter',
      toggleWeapon: 'u',
      skill: 'i',
    }),
  },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
const waiting = ref('')

const rows = computed(() => [
  ['up', '上移'],
  ['down', '下移'],
  ['left', '左移'],
  ['right', '右移'],
  ['fire', '开火'],
  ['toggleWeapon', '切武器'],
  ['skill', '技能'],
])

function pretty(k) {
  if (k === ' ') return 'Space'
  return String(k)
}

function begin(key) {
  if (props.readonly) return
  waiting.value = key
}

function onKeydown(e) {
  if (!waiting.value || props.readonly) return
  const key = e.key === ' ' ? 'Space' : e.key
  emit('update:modelValue', { ...props.modelValue, [waiting.value]: key })
  waiting.value = ''
  e.preventDefault()
}
</script>

<template>
  <div class="kb" tabindex="0" @keydown="onKeydown">
    <div v-for="r in rows" :key="r[0]" class="row">
      <span>{{ r[1] }}</span>
      <button type="button" :disabled="readonly" @click="begin(r[0])">
        {{ waiting === r[0] ? '按键中…' : pretty(modelValue[r[0]]) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.kb {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 8px;
  align-items: start;
}
.row {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}
.row span {
  font-size: 0.78rem;
  opacity: 0.86;
}
button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  padding: 3px 8px;
  min-width: 82px;
  justify-self: end;
  font-size: 0.74rem;
}

@media (max-width: 920px) {
  .kb {
    grid-template-columns: 1fr;
  }
}
</style>
