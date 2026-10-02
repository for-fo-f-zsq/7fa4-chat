<script setup>
import { ref, onMounted } from 'vue'
import { login } from '@/lib/store.js'
import { errText, toast } from '@/lib/util.js'

const emit = defineEmits(['done'])

const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const theme = ref('light')
const userEl = ref(null)

onMounted(() => {
  try { theme.value = localStorage.getItem('dev-theme') || 'light' } catch {}
  document.documentElement.setAttribute('data-theme', theme.value)
  userEl.value?.focus()
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
  try { localStorage.setItem('dev-theme', theme.value) } catch {}
}

async function submit() {
  if (busy.value) return
  error.value = ''
  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  busy.value = true
  try {
    await login(username.value.trim(), password.value)
    toast.ok('登录成功')
    emit('done')
  } catch (e) {
    // 区分「凭据错误」与「账户停用」——后者需要管理员介入
    if (e && e.code === 'ACCOUNT_DISABLED') error.value = '该账户已被停用，请联系超级管理员'
    else if (e && e.code === 'INVALID_CREDENTIALS') error.value = '用户名或密码不正确'
    else if (e && e.code === 'RATE_LIMITED') error.value = '尝试过于频繁，请稍候再试'
    else error.value = errText(e)
  } finally {
    busy.value = false
    password.value = ''
  }
}
</script>

<template>
  <div class="login">
    <button class="login__theme btn btn--ghost btn--icon btn--sm" :title="theme === 'dark' ? '浅色' : '深色'" @click="toggleTheme">
      <i class="fa-solid" :class="theme === 'dark' ? 'fa-sun' : 'fa-moon'" />
    </button>

    <form class="login__card" @submit.prevent="submit">
      <div class="login__brand">
        <div class="login__mark">7fa4</div>
        <h1 class="login__title">管理后台</h1>
        <p class="login__sub">请使用管理员账户登录</p>
      </div>

      <div class="field">
        <label class="field__label" for="lg-user">用户名</label>
        <input
          id="lg-user"
          ref="userEl"
          v-model="username"
          class="input"
          autocomplete="username"
          spellcheck="false"
          :disabled="busy"
          placeholder="admin"
        />
      </div>

      <div class="field">
        <label class="field__label" for="lg-pass">密码</label>
        <input
          id="lg-pass"
          v-model="password"
          class="input"
          type="password"
          autocomplete="current-password"
          :disabled="busy"
          placeholder="••••••••"
        />
      </div>

      <p v-if="error" class="login__error" role="alert">{{ error }}</p>

      <button class="btn btn--primary login__submit" type="submit" :disabled="busy">
        <span v-if="busy" class="spinner" />
        <span>{{ busy ? '登录中…' : '登录' }}</span>
      </button>

      <p class="login__hint">忘记密码？请在服务器上使用 CLI 重置：<code>node admin-cli.js reset-password &lt;用户名&gt;</code></p>
    </form>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--bg);
  position: relative;
}
.login__theme { position: fixed; top: 16px; right: 16px; }

.login__card {
  width: 100%;
  max-width: 372px;
  padding: 32px 30px 26px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
}
.login__brand { display: flex; flex-direction: column; align-items: center; gap: 7px; margin-bottom: 6px; }
.login__mark {
  width: 46px; height: 46px;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: -0.03em;
}
.login__title { font-size: 19px; font-weight: 680; letter-spacing: -0.02em; margin: 0; }
.login__sub { font-size: 13px; color: var(--text-3); }

.login__error {
  padding: 9px 12px;
  border-radius: var(--r-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12.5px;
  line-height: 1.5;
}
.login__submit { height: 38px; width: 100%; margin-top: 2px; }
.login__hint {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
  text-align: center;
  margin-top: 2px;
}
.login__hint code {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--bg-sunken);
  color: var(--text-2);
}
</style>
