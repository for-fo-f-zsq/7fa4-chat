<template>
  <div class="login-root">
    <div class="title-bar">
      <div class="title-bar-drag">
        <span class="title-bar-title">7FA4 Chat</span>
      </div>
      <div class="title-bar-controls">
        <button class="title-btn title-minimize" @click="windowMinimize"><i class="fas fa-minus"></i></button>
        <button class="title-btn title-maximize" @click="windowMaximize"><i class="fas" :class="isMaximized ? 'fa-clone' : 'fa-square'"></i></button>
        <button class="title-btn title-close" @click="windowClose"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div class="container">
      <div class="box">
        <UiButton class="btn-guest" variant="text" size="sm" icon="fas fa-arrow-left" title="返回主界面（游客模式）" @click="emit('guest')">返回</UiButton>
        <div class="logo">
          <div class="logo-icon">
            <img src="../../icon/icon.ico" style="width:100%">
          </div>
        </div>
        <h2>7FA4 Chat</h2>
        <UiInput
          v-model="username"
          class="login-input"
          size="lg"
          prefix-icon="fas fa-user"
          placeholder="用户名"
          label="用户名"
          hide-label
          autofocus
          @enter="login"
        />
        <UiInput
          v-model="password"
          class="login-input"
          type="password"
          size="lg"
          prefix-icon="fas fa-lock"
          placeholder="密码"
          label="密码"
          hide-label
          @enter="login"
        />
        <div class="remember-me">
          <UiSwitch v-model="remember" size="sm" label="保持登录" />
        </div>
        <div class="api-url-select-row">
          <label class="api-url-label">API网址</label>
          <div class="api-url-row">
            <UiDropdown
              v-model="apiUrl"
              class="api-url-dropdown"
              :options="apiUrlOptions"
              size="sm"
              aria-label="API 网址"
            />
            <UiIconButton
              class="api-settings-btn"
              icon="fas fa-external-link-alt"
              aria-label="打开服务端设置"
              size="sm"
              variant="soft"
              @click="openApiSettings"
            />
          </div>
        </div>
        <UiButton class="login-btn" variant="primary" size="lg" block :loading="loading" @click="login">
          {{ loading ? '登录中...' : '登录' }}
        </UiButton>
        <UiBanner v-if="error" class="login-error" variant="danger" :description="error" />
      </div>
    </div>
  </div>
</template>

<script setup>
// 用法：<LoginView @login="enterMain" @guest="enterGuest" />

import { ref, onMounted, watch } from 'vue'
import md5 from 'md5'
import { tryLogin } from '../utils.js'
import { useWindowControls } from '../composables/useWindowControls.js'
import { UiBanner, UiButton, UiDropdown, UiIconButton, UiInput, UiSwitch } from '@/ui'

const { isMaximized, windowMinimize, windowMaximize, windowClose } = useWindowControls()

const emit = defineEmits(['login', 'guest'])

const username = ref('')
const password = ref('')
const remember = ref(false)
const apiUrl = ref('https://jx.7fa4.cn')
const error = ref('')
const loading = ref(false)

const apiUrlOptions = [
  { value: 'https://jx.7fa4.cn', label: 'jx.7fa4.cn' },
  { value: 'https://in.7fa4.cn', label: 'in.7fa4.cn' }
]

function showError(msg) {
  error.value = msg
}

async function onSuccess(type) {
  // #2 登录成功：写入 localStorage 持久化登录态（不点退登则一直保持登录）
  localStorage.setItem('7fa4_logined', '1')
  if (type === 0 && remember.value) {
    const setting = await window.api.loadSetting()
    setting.keepLogin = true
    setting.loginUsername = username.value
    // 直接存原始密码到本地加密存储（setting.7c），不再做 md5
    setting.loginPassword = password.value
    await window.api.saveSetting(setting)
  }
  emit('login')
}

async function doLogin(user, rawPwd, type) {
  loading.value = true
  // 发往服务端仍需 md5（syzoj2 接口契约），存储侧已不再 +md5
  const hashedPwd = md5(rawPwd + 'syzoj2_xxx')
  try {
    const data = await tryLogin(user, hashedPwd)
    loading.value = false
    switch (data.error_code) {
      case 1001: showError('用户不存在'); break
      case 1002: showError('密码错误'); break
      case 1003: showError('您尚未设置密码'); break
      case 1004: showError('您的账号长时间没有登录，已暂停使用。如需继续使用请联系老师。'); break
      case 1005: showError('本节课你不该在教室'); break
      case -2:
      case -3:
        showError(data.message || '网络异常，请检查连接后重试'); break
      // -1 是服务端捕获到的异常（modules/user.js 的 catch 分支），最常见的是「用户名或
      // 密码长度/字符不合法」这类校验失败 —— 以前一律显示「未知错误」，用户不知道该改什么。
      case -1: showError('用户名或密码不合法，请检查后重试'); break
      case 1: onSuccess(type); return
      default: showError(data.message || ('登录失败（错误码 ' + data.error_code + '）')); break
    }
  } catch {
    loading.value = false
    showError('未知错误')
  }
}

function login() {
  if (loading.value) return
  error.value = ''
  doLogin(username.value, password.value, 0)
}

function openApiSettings() {
  const url = (apiUrl.value).replace(/\/$/, '') + ':8888'
  window.api.openExternal(url)
}

watch(apiUrl, async () => {
  const setting = await window.api.loadSetting()
  setting.apiUrl = apiUrl.value
  await window.api.saveSetting(setting)
})

onMounted(async () => {
  // #2 登录持久化由 App 初始化门控处理（localStorage 有标记直接进主界面）。
  // 本组件仅作为"主动登录/重新登录"入口出现，启动时不会挂载；
  // 若已是登录态进来（如 relogin 后），仍展示登录框供重新输入。
  try {
    const setting = await window.api.loadSetting()
    if (setting.theme && setting.theme !== 'default') {
      document.documentElement.classList.add(`theme-${setting.theme}`)
    }
    if (setting.apiUrl) apiUrl.value = setting.apiUrl.replace(/^http:\/\//, 'https://')
    // 旧版本存的是 md5 哈希（32 位十六进制），新版本改存明文，升级后清空、不自动填充
    if (setting.loginPassword && /^[a-f0-9]{32}$/i.test(setting.loginPassword)) {
      setting.keepLogin = false
      setting.loginUsername = ''
      setting.loginPassword = ''
      await window.api.saveSetting(setting)
    } else if (setting.keepLogin && setting.loginUsername && setting.loginPassword) {
      // 已保存账号 + 保持登录：自动填充并直接进入主界面（不再要求手动点登录）
      username.value = setting.loginUsername
      password.value = setting.loginPassword
      remember.value = true
      // 若本地已有登录标记跳过；否则仍走用户手动确认。此处保持手动登录（避免无会话时误导）
    }
  } catch {}
})
</script>

<style scoped src="../css/login-view.css"></style>
