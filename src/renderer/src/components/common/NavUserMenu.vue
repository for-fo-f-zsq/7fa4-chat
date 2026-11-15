<template>
  <UiPopover
    :open="open"
    :placement="narrow ? 'top' : 'right'"
    :offset="10"
    @update:open="emit('update:open', $event)"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>
    <template #content>
      <div class="nav-user-menu">
        <div class="nav-user-menu-head">
          <div class="nav-user-menu-head-top">
            <UiAvatar class="nav-user-menu-avatar" :size="46" :color="avatarTint(selfUid)" :name="selfName || '未登录'">
              <span v-if="selfInitial" class="nav-user-initial-lg">{{ selfInitial }}</span>
              <i v-else class="fas fa-user nav-user-fallback" aria-hidden="true"></i>
            </UiAvatar>
            <div class="nav-user-menu-names">
              <div class="nav-user-menu-name">{{ selfName || '未登录' }}</div>
              <div v-if="selfUname" class="nav-user-menu-uname">@{{ selfUname }}</div>
            </div>
          </div>
          <div v-if="loggedIn" class="nav-user-menu-info">
            <div class="info-item"><span class="info-key">UID</span><span class="info-val mono u-tabular-nums">{{ selfUid }}</span></div>
            <div v-if="selfRealName" class="info-item"><span class="info-key">真名</span><span class="info-val">{{ selfRealName }}</span></div>
            <div v-if="selfSchool" class="info-item"><span class="info-key">学校</span><span class="info-val">{{ selfSchool }}</span></div>
            <div v-if="selfSeat" class="info-item"><span class="info-key">座位</span><span class="info-val">{{ selfSeat }}</span></div>
          </div>
        </div>

        <div class="nav-user-menu-group">
          <button type="button" class="nav-user-menu-item" @click="emit('go', 'update')">
            <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
            <span>版本更新</span>
            <UiBadge v-if="hasUpdate" class="nav-update-tag" variant="danger" size="sm">有新版本</UiBadge>
          </button>
          <button type="button" class="nav-user-menu-item" @click="emit('go', 'donate')">
            <i class="fas fa-heart" aria-hidden="true"></i>
            <span>赞助</span>
          </button>
          <button type="button" class="nav-user-menu-item" @click="emit('go', 'about')">
            <i class="fas fa-info-circle" aria-hidden="true"></i>
            <span>关于</span>
          </button>
          <button type="button" class="nav-user-menu-item" @click="emit('open-announcement')">
            <i class="fas fa-bullhorn" aria-hidden="true"></i>
            <span>版本公告</span>
          </button>
          <button type="button" class="nav-user-menu-item" @click="emit('open-feedback')">
            <i class="fas fa-comment-dots" aria-hidden="true"></i>
            <span>意见反馈</span>
          </button>
        </div>

        <div class="nav-user-menu-group">
          <button v-if="!loggedIn" type="button" class="nav-user-menu-item" @click="emit('action', 'login')">
            <i class="fas fa-sign-in-alt" aria-hidden="true"></i>
            <span>登录</span>
          </button>
          <button v-if="loggedIn" type="button" class="nav-user-menu-item" @click="emit('action', 'relogin')">
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
            <span>重新登录</span>
          </button>
          <button v-if="loggedIn" type="button" class="nav-user-menu-item danger" @click="emit('action', 'logout')">
            <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </template>
  </UiPopover>
</template>

<script setup>
import { UiAvatar, UiBadge, UiPopover } from '@/ui'
import { avatarTint } from '../../utils.js'

defineProps({
  open: { type: Boolean, default: false },
  narrow: { type: Boolean, default: false },
  loggedIn: { type: Boolean, default: true },
  hasUpdate: { type: Boolean, default: false },
  selfUid: { type: [String, Number], default: '' },
  selfName: { type: String, default: '' },
  selfUname: { type: String, default: '' },
  selfInitial: { type: String, default: '' },
  selfRealName: { type: String, default: '' },
  selfSchool: { type: String, default: '' },
  selfSeat: { type: String, default: '' },
})

const emit = defineEmits(['update:open', 'go', 'action', 'open-announcement', 'open-feedback'])
</script>

<style scoped src="../../css/components/nav-user-menu.css"></style>
