<script setup>
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'normal' },
  confirmText: { type: String, default: '知道了' },
  showCancel: { type: Boolean, default: false },
  cancelText: { type: String, default: '取消' },
})

const emit = defineEmits(['update:open', 'confirm', 'cancel'])

function close() {
  emit('update:open', false)
}

function onConfirm() {
  emit('confirm')
  emit('update:open', false)
}

function onCancel() {
  emit('cancel')
  emit('update:open', false)
}

function onBackdrop(e) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="cdim" role="dialog" aria-modal="true" @click="onBackdrop">
      <div class="cbox" :class="['v-' + variant, size === 'wide' ? 'wide' : '']" @click.stop>
        <div class="c-accent" aria-hidden="true" />
        <h3 v-if="title" class="ctitle">{{ title }}</h3>
        <p v-if="message" class="cmsg">{{ message }}</p>
        <slot />
        <div class="cactions">
          <button v-if="showCancel" type="button" class="cbtn ghost" @click="onCancel">{{ cancelText }}</button>
          <button type="button" class="cbtn main" @click="onConfirm">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cdim {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 4, 0.72);
}
.cbox {
  position: relative;
  width: min(440px, 100%);
  max-height: min(82vh, 560px);
  overflow: auto;
  border-radius: 18px;
  padding: 22px 22px 18px;
  background: rgba(16, 22, 19, 0.96);
  color: var(--text, #e8f0ea);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.65);
}
.cbox.wide {
  width: min(1180px, 96vw);
  max-height: min(90vh, 920px);
}
.c-accent {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 0;
  height: 3px;
  border-radius: 999px;
  opacity: 0.9;
}
.v-primary .c-accent {
  background: linear-gradient(90deg, #34d399, #2dd4bf);
}
.v-danger .c-accent {
  background: linear-gradient(90deg, #fb7185, #f97316);
}
.v-neutral .c-accent {
  background: linear-gradient(90deg, #94a3b8, #64748b);
}
.ctitle {
  margin: 6px 0 10px;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.cmsg {
  margin: 0 0 18px;
  font-size: 0.92rem;
  line-height: 1.55;
  white-space: pre-wrap;
  color: rgba(232, 240, 234, 0.86);
}
.cactions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
.cbtn {
  padding: 10px 18px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}
.cbtn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.cbtn:active {
  transform: translateY(1px);
}
.cbtn.main {
  background: linear-gradient(145deg, #10b981, #059669);
  color: #041910;
  border-color: rgba(255, 255, 255, 0.22);
}
.cbtn.ghost {
  background: transparent;
  opacity: 0.92;
}
</style>
