<script setup>
import { ref } from 'vue'
import { login, register } from '../net/httpClient.js'

const emit = defineEmits(['authed', 'back'])
const mode = ref('login')
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const fn = mode.value === 'login' ? login : register
    const res = await fn(username.value, password.value)
    emit('authed', res)
  } catch (e) {
    error.value = e.message || '操作失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth">
    <h2>联机模式</h2>
    <p class="muted">先登录账号再进入匹配/房间。</p>
    <div class="tabs">
      <button type="button" :class="{ on: mode === 'login' }" @click="mode = 'login'">登录</button>
      <button type="button" :class="{ on: mode === 'register' }" @click="mode = 'register'">注册</button>
    </div>
    <input v-model.trim="username" placeholder="账号（>=3位）" />
    <input v-model="password" type="password" placeholder="密码（>=6位）" />
    <p v-if="error" class="err">{{ error }}</p>
    <div class="row">
      <button type="button" @click="emit('back')">返回</button>
      <button type="button" class="primary" :disabled="loading" @click="submit">{{ loading ? '处理中...' : '继续' }}</button>
    </div>
  </section>
</template>

<style scoped>
.auth {
  width: min(460px, 100%);
  margin: 0 auto;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  background: var(--surface);
  display: grid;
  gap: 10px;
}
.tabs {
  display: flex;
  gap: 8px;
}
.tabs button.on {
  border-color: rgba(52, 211, 153, 0.6);
}
input,
button {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  padding: 9px 10px;
}
.row {
  display: flex;
  justify-content: space-between;
}
.err {
  color: #fb7185;
}
.muted {
  margin: 0;
  opacity: 0.7;
}
.primary {
  background: linear-gradient(145deg, #10b981, #059669);
  color: #052e1a;
}
</style>
