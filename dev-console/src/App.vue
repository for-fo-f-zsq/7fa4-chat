<script setup>
import { ref, computed, onMounted, onBeforeUnmount, provide } from 'vue'
import { session, refreshSession, loadConfig, can } from '@/lib/store.js'
import { toast } from '@/lib/util.js'

import AppShell from '@/components/AppShell.vue'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'

import LoginView from '@/views/LoginView.vue'
import OverviewView from '@/views/OverviewView.vue'
import PostersView from '@/views/PostersView.vue'
import FeedbackView from '@/views/FeedbackView.vue'
import AccountsView from '@/views/AccountsView.vue'
import ConfigView from '@/views/ConfigView.vue'
import AuditView from '@/views/AuditView.vue'

const page = ref('overview')
const badges = ref({})          // 侧栏角标：{ posters: 3, feedback: 5 }
const confirm = ref(null)

// 弹窗与角标交给子页面使用
provide('confirm', { ask: (o) => confirm.value.ask(o) })
provide('setBadge', (key, n) => {
  const next = Object.assign({}, badges.value)
  if (n > 0) next[key] = n
  else delete next[key]
  badges.value = next
})

const VIEWS = {
  overview: OverviewView,
  posters: PostersView,
  feedback: FeedbackView,
  accounts: AccountsView,
  config: ConfigView,
  audit: AuditView,
}

const currentView = computed(() => VIEWS[page.value] || OverviewView)

function navigate(key) {
  if (key === 'login') {
    page.value = 'overview'
    return
  }
  // 无权访问的页面直接回落总览，避免出现空白
  const permMap = {
    posters: 'content.view',
    feedback: 'content.view',
    accounts: 'account.manage',
    config: 'config.manage',
    audit: 'audit.view',
  }
  const need = permMap[key]
  if (need && !can(need)) {
    toast.error('没有访问该页面的权限')
    page.value = 'overview'
    return
  }
  page.value = key
}

onMounted(async () => {
  const ok = await refreshSession()
  if (ok) await loadConfig()
})

// 会话失效（cookie 过期）时自动回到登录页
function onSessionLost() {
  page.value = 'login'
  toast.error('登录状态已失效，请重新登录')
}
provide('onSessionLost', onSessionLost)

onBeforeUnmount(() => {})
</script>

<template>
  <div v-if="!session.ready" class="boot">
    <div class="spinner" style="width: 24px; height: 24px; border-width: 2.5px" />
    <p class="muted" style="font-size: 13px">正在加载…</p>
  </div>

  <LoginView v-else-if="!session.authenticated" @done="page = 'overview'" />

  <AppShell v-else :page="page" :badges="badges" @navigate="navigate">
    <component :is="currentView" />
  </AppShell>

  <ToastHost />
  <ConfirmHost ref="confirm" />
</template>

<style scoped>
.boot {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--accent);
}
</style>
