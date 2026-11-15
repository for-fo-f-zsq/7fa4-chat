<template>
  <UiModal v-model:open="modalOpen" size="sm" aria-label="用户资料" @closed="$emit('close')">
    <template #header>
      <div class="userinfo-header">
        <UiAvatar shape="rounded" size="2xl" :color="avatarTint(uid)" :name="getAvatarInitial(uid)" />
        <div class="user-note-wrapper">
          <EditableTitle
            :value="displayName(user || { uid })"
            :editable="user?.watcher === true"
            :multiline="true"
            :maxlength="15"
            :edit-initial-value="user?.note || user?.nickname || ''"
            @save="saveUserNote"
          />
        </div>
        <div class="userinfo-actions">
          <UiIconButton
            v-if="!isFriend"
            icon="fas fa-plus"
            aria-label="添加好友"
            size="sm"
            @click="$emit('addfriend', uid)"
          />
          <UiIconButton v-else icon="fas fa-check" aria-label="已是好友" size="sm" disabled />
          <UiIconButton
            v-if="user?.watcher === true"
            icon="fas fa-comment"
            aria-label="私信"
            size="sm"
            @click="startChat"
          />
        </div>
      </div>
    </template>

    <div class="userinfo-body">
      <div v-for="row in infoRows" :key="row.label" class="userinfo-row">
        <span class="userinfo-label">{{ row.label }}</span>
        <a
          v-if="row.isLink"
          class="userinfo-value userinfo-link"
          href="#"
          @click.prevent="openLink(homepageUrl)"
        >{{ row.value }}</a>
        <span
          v-else
          class="userinfo-value"
          :class="{ 'u-tabular-nums': row.tabular }"
          :style="row.color ? { color: row.color } : undefined"
        >{{ row.value }}</span>
      </div>
    </div>
  </UiModal>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { UiAvatar, UiIconButton, UiModal } from '@/ui'
import { store } from '@/store.js'
import {
  avatarTint,
  displayName,
  getAvatarInitial,
  getGradeColor,
  getGradeLabel,
  isWebBrowser,
  localGradeColorKey,
  usersJson,
} from '@/utils.js'
import EditableTitle from '@/components/common/EditableTitle.vue'

const props = defineProps({
  uid: Number,
})

const emit = defineEmits(['close', 'addfriend', 'switchToChat'])

const user = computed(() => store.users?.[props.uid] || null)
const isFriend = computed(() => user.value?.watchee === true)
const realName = computed(() => user.value?.realname || usersJson?.[props.uid]?.name || '')

const gradeLabel = computed(() => {
  const colorKey = localGradeColorKey(props.uid)
  if (!colorKey || colorKey === 'uk') return ''
  return getGradeLabel(props.uid)
})

const gradeColor = computed(() => getGradeColor(props.uid))
const gradeClass = computed(() => user.value?.grade_class || '')

const apiUrl = ref('')
const modalOpen = ref(false)

onMounted(async () => {
  nextTick(() => {
    modalOpen.value = true
  })
  try {
    if (isWebBrowser()) {
      apiUrl.value = location.origin
      return
    }
    const setting = await window.api.loadSetting()
    apiUrl.value = (setting.apiUrl || 'https://jx.7fa4.cn').replace(/^http:\/\//, 'https://') + ':8888'
  } catch (err) {
    console.error('获取设置失败:', err)
  }
})

const homepageUrl = computed(() => (apiUrl.value ? `${apiUrl.value}/user/${props.uid}` : ''))

const infoRows = computed(() => {
  const rows = [{ label: 'ID', value: props.uid, tabular: true }]
  if (user.value?.username) rows.push({ label: '用户名', value: user.value.username })
  if (user.value?.student_no) rows.push({ label: '学号', value: user.value.student_no, tabular: true })
  if (user.value?.nickname) rows.push({ label: '昵称', value: user.value.nickname })
  if (realName.value) rows.push({ label: '真名', value: realName.value })
  if (gradeLabel.value) rows.push({ label: '年级', value: gradeLabel.value, color: gradeColor.value })
  if (user.value?.note) rows.push({ label: '备注', value: user.value.note })
  if (gradeClass.value) rows.push({ label: '班级', value: gradeClass.value })
  if (user.value?.seat) rows.push({ label: '座位', value: user.value.seat, tabular: true })
  rows.push({ label: '个人主页', value: `/user/${props.uid}`, isLink: true })
  return rows
})

function openLink(url) {
  if (!url) return
  window.api?.openExternal?.(url) || window.open(url)
}

function startChat() {
  emit('switchToChat', { type: 'user', id: props.uid })
  modalOpen.value = false
}

function saveUserNote(rawNote) {
  if (!user.value) return
  const newUserNote = String(rawNote || '').trim().slice(0, 15)
  user.value.note = user.value.nickname === newUserNote ? '' : newUserNote
}
</script>

<style scoped src="../../css/components/user-info.css"></style>
