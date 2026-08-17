<template>
  <div class="userinfo-overlay" @click.self="$emit('close')">
    <div class="userinfo-modal">
      <div class="userinfo-header">
        <div class="user-note-wrapper" v-if="editingName">
          <input
            ref="nameInputRef"
            v-model="tempName"
            type="text"
            class="user-note-input"
            @keydown.enter="saveUserNote"
            @keydown.esc="cancelEditName"
            @blur="saveUserNote"
            maxlength="50"
          />
        </div>
        <div class="user-note-wrapper" v-else>
          <h3 class="editable-name" :class="{ 'editable': user && user.watcher === true }" @click="startEditName">
            {{ displayName(user || { uid }) }}
            <i v-if="user && user.watcher === true" class="fas fa-pencil-alt edit-icon"></i>
          </h3>
        </div>
        <div class="userinfo-actions">
          <button class="userinfo-action-btn" v-if="!isFriend" @click="$emit('addfriend', uid)">
            <i class="fas fa-plus"></i>
          </button>
          <button class="userinfo-action-btn disabled" v-if="isFriend">
            <i class="fas fa-check"></i>
          </button>
          <button class="userinfo-action-btn" v-if="user?.watcher === true" @click="startChat">
            <i class="fas fa-comment"></i>
          </button>
          <button class="userinfo-close" @click="$emit('close')">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="userinfo-body">
        <div class="userinfo-row">
          <span class="userinfo-label">Uid</span>
          <span class="userinfo-value">{{ user?.uid || uid }}</span>
        </div>
        <div class="userinfo-row" v-if="user?.username">
          <span class="userinfo-label">用户名</span>
          <span class="userinfo-value">{{ user.username }}</span>
        </div>
        <div class="userinfo-row" v-if="user?.nickname">
          <span class="userinfo-label">昵称</span>
          <span class="userinfo-value">{{ user.nickname }}</span>
        </div>
        <div class="userinfo-row" v-if="realName">
          <span class="userinfo-label">真名</span>
          <span class="userinfo-value">{{ realName }}</span>
        </div>
        <div class="userinfo-row" v-if="gradeLabel">
          <span class="userinfo-label">年级</span>
          <span class="userinfo-value" :style="{ color: gradeColor }">{{ gradeLabel }}</span>
        </div>
        <div class="userinfo-row" v-if="user?.note">
          <span class="userinfo-label">备注</span>
          <span class="userinfo-value">{{ user.note }}</span>
        </div>
        <div class="userinfo-row" v-if="gradeClass">
          <span class="userinfo-label">班级</span>
          <span class="userinfo-value">{{ gradeClass }}</span>
        </div>
        <div class="userinfo-row" v-if="user?.seat">
          <span class="userinfo-label">座位</span>
          <span class="userinfo-value">{{ user.seat }}</span>
        </div>
        <div class="userinfo-row">
          <span class="userinfo-label">个人主页</span>
          <a class="userinfo-value userinfo-link" href="#" @click.prevent="openLink(homepageUrl)">/user/{{ uid }}</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import { store } from '../store.js'
import { displayName, getGradeColor, getGradeLabel, usersJson } from '../utils.js'

const props = defineProps({
  uid: Number
})

const emit = defineEmits(['close', 'addfriend', 'switchToChat'])

const user = computed(() => store.users?.[props.uid] || null)

const isFriend = computed(() => user.value?.watchee === true) // 是否已关注 TA（watchee）

const realName = computed(() => {
  if (user.value?.realname) return user.value.realname
  return usersJson?.[props.uid]?.name || ''
})

const gradeLabel = computed(() => {
  const colorKey = usersJson?.[props.uid]?.colorKey
  if (!colorKey || colorKey === 'uk') return ''
  return getGradeLabel(props.uid)
})

const gradeColor = computed(() => {
  return getGradeColor(props.uid)
})

const gradeClass = computed(() => {
  if (!user.value) return ''
  return user.value.grade_class || ''
})

const apiUrl = ref('')
const editingName = ref(false)
const tempName = ref('')
const nameInputRef = ref(null)

onMounted(async () => {
  try {
    const setting = await window.api.loadSetting()
    apiUrl.value = ((setting.apiUrl || 'https://jx.7fa4.cn').replace(/^http:\/\//, 'https://')) + ':8888'
  } catch (err) {
    console.error('获取设置失败:', err)
  }
})

const homepageUrl = computed(() => {
  if (!apiUrl.value) return ''
  return `${apiUrl.value}/user/${props.uid}`
})

function openLink(url) {
  if (!url) return
  window.api?.openExternal?.(url) || window.open(url)
}

function startChat() {
  emit('switchToChat', { type: 'user', id: props.uid })
  emit('close')
}

function startEditName() {
  if (user.value?.watcher !== true) return // 仅对方关注我（正常关系）可编辑备注
  tempName.value = user.value.note || user.value.nickname
  editingName.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function cancelEditName() {
  editingName.value = false
}

function saveUserNote() {
  const newUserNote = tempName.value.trim().slice(0, 15)
  if (user.value.nickname === newUserNote) {
    user.value.note = ''
  } else {
    user.value.note = newUserNote
  }
  editingName.value = false
}

// ========== 头像 ==========</script>
