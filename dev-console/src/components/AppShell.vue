<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { session, isSuper, togglePolling, refreshNow, logout, can } from '@/lib/store.js'
import { relTime } from '@/lib/util.js'

const emit = defineEmits(['navigate'])

const props = defineProps({
  page: { type: String, required: true },
  // 待办角标（如待审海报数），由各页面通过 provide 注入不方便，改用事件传
  badges: { type: Object, default: () => ({}) },
})

// 侧栏导航。icon 为 Font Awesome 类名（自托管，见 main.js 的 vendor 引入）。
const NAV = [
  { key: 'overview', label: '总览', icon: 'fa-chart-line', perm: null },
  { key: 'posters', label: '海报审核', icon: 'fa-image', perm: 'content.view', badge: 'posters' },
  { key: 'feedback', label: '意见反馈', icon: 'fa-comment-dots', perm: 'content.view', badge: 'feedback' },
  { key: 'accounts', label: '管理员账户', icon: 'fa-user-shield', perm: 'account.manage' },
  { key: 'config', label: '系统配置', icon: 'fa-sliders', perm: 'config.manage' },
  { key: 'audit', label: '审计日志', icon: 'fa-scroll', perm: 'audit.view' },
]

const items = computed(() => NAV.filter((n) => !n.perm || can(n.perm)))

const theme = ref('light')
const menuOpen = ref(false)
const sidebarOpen = ref(false) // 窄屏抽屉

function applyTheme(t) {
  theme.value = t
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem('dev-theme', t) } catch {}
}

onMounted(() => {
  let saved = 'light'
  try { saved = localStorage.getItem('dev-theme') || '' } catch {}
  if (!saved) {
    saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  applyTheme(saved)

  const onDoc = (e) => {
    if (menuOpen.value && !e.target.closest?.('.avatar-wrap')) menuOpen.value = false
  }
  document.addEventListener('click', onDoc)
  onBeforeUnmount(() => document.removeEventListener('click', onDoc))
})

async function doLogout() {
  menuOpen.value = false
  await logout()
  emit('navigate', 'login')
}

function nav(key) {
  sidebarOpen.value = false
  emit('navigate', key)
}

const initial = computed(() => {
  const n = session.user?.display_name || session.user?.username || '?'
  return n.slice(0, 1).toUpperCase()
})

async function doRefresh() {
  await refreshNow()
}
</script>

<template>
  <div class="shell">
    <!-- 窄屏遮罩 -->
    <div v-if="sidebarOpen" class="drawer-scrim" @click="sidebarOpen = false" />

    <aside class="sidebar" :class="{ 'sidebar--open': sidebarOpen }">
      <div class="brand">
        <div class="brand__mark">7fa4</div>
        <div class="brand__text">
          <div class="brand__title">管理后台</div>
          <div class="brand__sub">Console</div>
        </div>
      </div>

      <nav class="nav">
        <button
          v-for="n in items"
          :key="n.key"
          class="nav__item"
          :class="{ 'nav__item--active': page === n.key }"
          @click="nav(n.key)"
        >
          <span class="nav__icon"><i class="fa-solid" :class="n.icon" /></span>
          <span class="grow truncate" style="text-align: left">{{ n.label }}</span>
          <span v-if="n.badge && badges[n.badge]" class="nav__badge">{{ badges[n.badge] }}</span>
        </button>
      </nav>

      <div class="sidebar__foot">
        <div class="syncline">
          <span class="syncline__dot" :class="{ 'syncline__dot--off': !session.polling }" />
          <span class="grow">
            {{ session.polling ? '自动刷新中' : '已暂停刷新' }}
          </span>
          <button
            class="btn btn--ghost btn--sm"
            :title="session.polling ? '暂停自动刷新' : '恢复自动刷新'"
            @click="togglePolling()"
          >
            <i class="fa-solid" :class="session.polling ? 'fa-pause' : 'fa-play'" />
          </button>
        </div>
        <div class="muted" style="font-size: 11.5px; padding-left: 14px">
          {{ session.lastSyncAt ? '同步于 ' + relTime(session.lastSyncAt) : '等待首次同步…' }}
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="btn btn--ghost btn--icon btn--sm hamburger" aria-label="菜单" @click="sidebarOpen = true">
          <i class="fa-solid fa-bars" />
        </button>
        <h1 class="topbar__title">{{ (items.find((n) => n.key === page) || {}).label || '' }}</h1>
        <div class="grow" />

        <button class="btn btn--sm" :disabled="!session.polling" @click="doRefresh">
          <i class="fa-solid fa-arrow-rotate-right" />
          <span>立即刷新</span>
        </button>

        <button
          class="btn btn--ghost btn--icon btn--sm"
          :title="theme === 'dark' ? '切换到浅色' : '切换到深色'"
          @click="applyTheme(theme === 'dark' ? 'light' : 'dark')"
        >
          <i class="fa-solid" :class="theme === 'dark' ? 'fa-sun' : 'fa-moon'" />
        </button>

        <div class="avatar-wrap" style="position: relative">
          <button class="avatar" @click.stop="menuOpen = !menuOpen">
            <span class="avatar__img">{{ initial }}</span>
            <span class="avatar__name truncate">{{ session.user?.display_name || session.user?.username }}</span>
            <span class="avatar__caret"><i class="fa-solid fa-chevron-down" /></span>
          </button>
          <div v-if="menuOpen" class="avatar-menu" @click="menuOpen = false">
            <div class="avatar-menu__head">
              <div class="avatar-menu__name">{{ session.user?.display_name || session.user?.username }}</div>
              <div class="muted" style="font-size: 12px">
                {{ session.user?.username }} ·
                {{ session.user?.role === 'super' ? '超级管理员' : '运营' }}
              </div>
            </div>
            <div class="avatar-menu__sep" />
            <button class="menu-item" @click="doLogout">
              <i class="fa-solid fa-right-from-bracket" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </header>

      <div v-if="session.siteNotice" class="notice">
        <i class="fa-solid fa-bullhorn" />
        <span>{{ session.siteNotice }}</span>
      </div>

      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }

/* ---------- 侧栏 ---------- */
.sidebar {
  width: var(--sidebar-w);
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--topbar-h);
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.brand__mark {
  width: 34px; height: 34px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: -0.03em;
}
.brand__title { font-size: 13.5px; font-weight: 650; line-height: 1.2; }
.brand__sub { font-size: 11px; color: var(--text-3); line-height: 1.2; }

.nav { flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 11px;
  border: none;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-2);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
}
.nav__item:hover { background: var(--bg-hover); color: var(--text); }
.nav__item--active { background: var(--accent-soft); color: var(--accent-text); font-weight: 600; }
.nav__icon { width: 18px; text-align: center; flex: none; font-size: 14px; }
.nav__badge {
  min-width: 19px;
  height: 19px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: var(--danger);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sidebar__foot { flex: none; padding: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 5px; }
.syncline { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-2); }
.syncline__dot {
  width: 7px; height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0 3px var(--ok-soft);
}
.syncline__dot--off { background: var(--text-3); box-shadow: 0 0 0 3px var(--bg-sunken); }

/* ---------- 主区 ---------- */
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  height: var(--topbar-h);
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 30;
}
.topbar__title { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
.hamburger { display: none; }

.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 20px;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: 12.5px;
  border-bottom: 1px solid var(--border);
}
.notice > i[class*='fa-'] { flex: none; }

.content { flex: 1; padding: 20px; max-width: 1400px; width: 100%; }

/* ---------- 头像 ---------- */
.avatar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 9px 0 4px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-full);
  background: var(--bg-elev);
  cursor: pointer;
  transition: background var(--t-fast);
  max-width: 190px;
}
.avatar:hover { background: var(--bg-hover); }
.avatar__img {
  width: 26px; height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.avatar__name { font-size: 13px; font-weight: 550; }
.avatar__caret { color: var(--text-3); font-size: 10px; flex: none; }

.avatar-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 210px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-elev);
  box-shadow: var(--shadow-md);
  z-index: 50;
}
.avatar-menu__head { padding: 9px 11px 8px; }
.avatar-menu__name { font-size: 13.5px; font-weight: 620; margin-bottom: 1px; }
.avatar-menu__sep { height: 1px; background: var(--border); margin: 4px 0; }
.menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 8px 11px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.menu-item > i[class*='fa-'] { width: 14px; text-align: center; color: var(--text-3); font-size: 12.5px; flex: none; }
.menu-item:hover { background: var(--bg-hover); }

/* ---------- 窄屏 ---------- */
.drawer-scrim { position: fixed; inset: 0; z-index: 60; background: var(--scrim); }
@media (max-width: 900px) {
  .hamburger { display: inline-flex; }
  .sidebar {
    position: fixed;
    left: 0; top: 0; bottom: 0;
    z-index: 70;
    transform: translateX(-100%);
    transition: transform var(--t-base);
    box-shadow: var(--shadow-lg);
  }
  .sidebar--open { transform: translateX(0); }
  .content { padding: 14px; }
  .topbar { padding: 0 12px; gap: 7px; }
  .avatar__name { display: none; }
}
</style>
