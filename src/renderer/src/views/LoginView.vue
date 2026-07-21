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
            <option value="http://jx.7fa4.cn">jx.7fa4.cn</option>
            <option value="http://in.7fa4.cn">in.7fa4.cn</option>
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

const emit = defineEmits(['login']);

const username = ref('');
const password = ref('');
const remember = ref(false);
const apiUrl = ref('http://jx.7fa4.cn');
const error = ref('');
const loading = ref(false);

function onKeyLogin(e) {
  if (e.key === 'Enter') login();
}

function showError(msg) {
  error.value = msg;
}

async function onSuccess(type) {
  if (type === 0 && remember.value) {
    const hashedPwd = md5(password.value + 'syzoj2_xxx');
    const setting = await window.api.loadSetting();
    setting.keepLogin = true;
    setting.loginUsername = username.value;
    setting.loginPassword = hashedPwd;
    await window.api.saveSetting(setting);
  }
  emit('login');
}

async function doLogin(user, pwd, type) {
  loading.value = true;
  try {
    const data = await tryLogin(user, pwd);
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
  const hashedPwd = md5(password.value + 'syzoj2_xxx');
  doLogin(username.value, hashedPwd, 0);
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
  if (sessionStorage.getItem('logined') === 'true') {
    emit('login');
    return;
  }
  try {
    const setting = await window.api.loadSetting();
    if (setting.theme && setting.theme !== 'default') {
      document.documentElement.classList.add(`theme-${setting.theme}`);
    }
    if (setting.apiUrl) apiUrl.value = setting.apiUrl;
    if (setting.keepLogin && setting.loginUsername && setting.loginPassword) {
      doLogin(setting.loginUsername, setting.loginPassword, 1);
    }
  } catch {}
});
</script>
