<template>
  <UiModal v-model:open="modalOpen" size="sm" @closed="$emit('close')">
    <template #header>
      <div class="userinfo-header">
        <div class="user-note-wrapper" v-if="editingName">
          <input
            ref="nameInputRef"
            v-autofocus
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
          <UiIconButton v-if="!isFriend" icon="fas fa-plus" aria-label="添加好友" size="sm" @click="$emit('addfriend', uid)" />
          <UiIconButton v-else icon="fas fa-check" aria-label="已是好友" size="sm" disabled />
          <UiIconButton v-if="user?.watcher === true" icon="fas fa-comment" aria-label="私信" size="sm" @click="startChat" />
        </div>
      </div>
    </template>
    <div class="userinfo-body">
      <div class="userinfo-row">
        <span class="userinfo-label">ID</span>
        <span class="userinfo-value">{{ uid }}</span>
      </div>
      <!-- 注意字段来路：/chat/info 的 user.username 是「学号」、user.uid 是「登录名」（见 ChatView 的映射），
           而好友列表（friend/json）只返回 id/username/nickname/seat，没有登录名与学号。
           所以下面两行分别按资料完整度显示，缺了就不显示，而不是拿内部 id 冒充「Uid」。 -->
      <div class="userinfo-row" v-if="user?.username">
        <span class="userinfo-label">用户名</span>
        <span class="userinfo-value">{{ user.username }}</span>
      </div>
      <div class="userinfo-row" v-if="user?.student_no">
        <span class="userinfo-label">学号</span>
        <span class="userinfo-value">{{ user.student_no }}</span>
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
  </UiModal>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { store } from '../../store.js'
import { displayName, getGradeColor, getGradeLabel, usersJson, localGradeColorKey, isWebBrowser } from '../../utils.js'
import UiModal from '../../ui/UiModal/UiModal.vue'
import UiIconButton from '../../ui/UiIconButton/UiIconButton.vue'

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
  const colorKey = localGradeColorKey(props.uid)
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
const modalOpen = ref(false)

onMounted(async () => {
  nextTick(() => {
    modalOpen.value = true
  })
  try {
    // 网页版与 OJ 同源：主页链接就是当前站点，不能拼 :8888（那是客户端连 API 的端口）
    if (isWebBrowser()) { apiUrl.value = location.origin; return }
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
  modalOpen.value = false
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
</script>

<style scoped src="../../css/components/user-info.css"></style>
