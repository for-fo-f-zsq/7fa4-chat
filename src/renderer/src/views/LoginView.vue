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
      <button class="btn-guest" title="返回主界面（游客模式）" @click="emit('guest')"><i class="fas fa-arrow-left"></i> 返回</button>
      <div class="logo">
        <div class="logo-icon">
          <img src="../../icon/icon.ico" style="width:100%">
        </div>
      </div>
      <h2>Chat-7FA4</h2>
      <div class="input-group">
        <input type="text" class="input" v-model="username" placeholder="用户名" @keydown="onKeyLogin">
        <i class="fas fa-user input-icon"></i>
      </div>
      <div class="input-group">
        <input type="password" class="input" v-model="password" placeholder="密码" @keydown="onKeyLogin">
        <i class="fas fa-lock input-icon"></i>
      </div>
      <div class="remember-me">
        <label class="toggle-row">
          <span class="toggle-label">保持登录</span>
          <input type="checkbox" v-model="remember">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="api-url-select-row">
        <label class="api-url-label">API网址</label>
        <div class="api-url-row">
          <select class="api-url-dropdown" v-model="apiUrl">
            <option value="https://jx.7fa4.cn">jx.7fa4.cn</option>
            <option value="https://in.7fa4.cn">in.7fa4.cn</option>
          </select>
          <button class="api-settings-btn" title="打开服务端设置" @click="openApiSettings">
            <i class="fas fa-external-link-alt"></i>
          </button>
        </div>
      </div>
      <button class="btn" @click="login" :disabled="loading">{{ loading ? '登录中...' : '登录' }}</button>
      <div class="login-error" :class="{ show: error }">{{ error }}</div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import md5 from 'md5';
import { tryLogin } from '../utils.js';
import { useWindowControls } from '../composables/useWindowControls.js';
import '../css/login-view.css';
import '../css/base.css';
import '../../css/font-awesome/css/all.min.css';

const { isMaximized, windowMinimize, windowMaximize, windowClose } = useWindowControls()

const emit = defineEmits(['login', 'guest']);

const username = ref('');
const password = ref('');
const remember = ref(false);
const apiUrl = ref('https://jx.7fa4.cn');
const error = ref('');
const loading = ref(false);

function onKeyLogin(e) {
  if (e.key === 'Enter') login();
}

function showError(msg) {
  error.value = msg;
}

async function onSuccess(type) {
  // #2 登录成功：写入 localStorage 持久化登录态（不点退登则一直保持登录）
  localStorage.setItem('7fa4_logined', '1');
  if (type === 0 && remember.value) {
    const setting = await window.api.loadSetting();
    setting.keepLogin = true;
    setting.loginUsername = username.value;
    // 直接存原始密码到本地加密存储（setting.7c），不再做 md5
    setting.loginPassword = password.value;
    await window.api.saveSetting(setting);
  }
  emit('login');
}

async function doLogin(user, rawPwd, type) {
  loading.value = true;
  // 发往服务端仍需 md5（syzoj2 接口契约），存储侧已不再 +md5
  const hashedPwd = md5(rawPwd + 'syzoj2_xxx');
  try {
    const data = await tryLogin(user, hashedPwd);
    loading.value = false;
    switch (data.error_code) {
      case 1001: showError('用户不存在'); break;
      case 1002: showError('密码错误'); break;
      case 1003: showError('您尚未设置密码'); break;
      case 1004: showError('您的账号长时间没有登录，已暂停使用。如需继续使用请联系老师。'); break;
      case 1: onSuccess(type); return;
      default: showError('未知错误'); break;
    }
  } catch {
    loading.value = false;
    showError('未知错误');
  }
}

function login() {
  doLogin(username.value, password.value, 0);
}

function openApiSettings() {
  const url = (apiUrl.value).replace(/\/$/, '') + ':8888';
  window.api.openExternal(url);
}

watch(apiUrl, async () => {
  const setting = await window.api.loadSetting();
  setting.apiUrl = apiUrl.value;
  await window.api.saveSetting(setting);
});

onMounted(async () => {
  // #2 登录持久化由 App 初始化门控处理（localStorage 有标记直接进主界面）。
  // 本组件仅作为"主动登录/重新登录"入口出现，启动时不会挂载；
  // 若已是登录态进来（如 relogin 后），仍展示登录框供重新输入。
  try {
    const setting = await window.api.loadSetting();
    if (setting.theme && setting.theme !== 'default') {
      document.documentElement.classList.add(`theme-${setting.theme}`);
    }
    if (setting.apiUrl) apiUrl.value = setting.apiUrl.replace(/^http:\/\//, 'https://');
    // 旧版本存的是 md5 哈希（32 位十六进制），新版本改存明文，升级后清空、不自动填充
    if (setting.loginPassword && /^[a-f0-9]{32}$/i.test(setting.loginPassword)) {
      setting.keepLogin = false;
      setting.loginUsername = '';
      setting.loginPassword = '';
      await window.api.saveSetting(setting);
    } else if (setting.keepLogin && setting.loginUsername && setting.loginPassword) {
      // 已保存账号 + 保持登录：自动填充并直接进入主界面（不再要求手动点登录）
      username.value = setting.loginUsername;
      password.value = setting.loginPassword;
      remember.value = true;
      // 若本地已有登录标记跳过；否则仍走用户手动确认。此处保持手动登录（避免无会话时误导）
    }
  } catch {}
});
</script>
