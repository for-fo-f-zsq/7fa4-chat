<template>
  <UiModal v-model:open="modalOpen" size="sm" title="添加好友" @opened="focusSearch" @closed="finishClose">
    <div class="addfriend-search">
      <div class="addfriend-search-field">
        <UiInput
          ref="searchRef"
          v-model="query"
          class="addfriend-input"
          placeholder="搜索用户名 / 昵称 / 真名 / UID"
          prefix-icon="fas fa-search"
          clearable
        />
      </div>
      <UiDropdown
        v-model="gradeFilter"
        :options="gradeOptions"
        :auto-width="true"
        size="sm"
        aria-label="筛选年级"
      />
    </div>
    <div v-if="query.trim()" class="addfriend-direct">
      <UiButton variant="secondary" size="sm" block icon="fas fa-user-plus" @click="onDirectAdd">
        直接添加「{{ query.trim() }}」
      </UiButton>
    </div>
    <div v-if="users.length > 0" class="addfriend-list">
      <div
        v-for="u in users"
        :key="u.uid"
        class="p-list-row p-list-row--interactive addfriend-item"
        :class="{ 'is-friend': u.isFriend }"
        @click="onViewUser(u)"
      >
        <UiAvatar shape="rounded" size="md" :color="avatarTint(u.uid)" :name="u.initial" />
        <div class="p-list-row__main addfriend-item-info">
          <span class="addfriend-item-name" :style="{ color: u.gradeColor }">{{ u.realName }}</span>
          <span class="addfriend-item-detail u-tabular-nums">
            <template v-if="u.uid">{{ u.uid }}</template>
            <template v-if="u.nickname || u.username"> / </template>
            <template v-if="u.nickname">{{ u.nickname }}</template>
            <template v-if="u.nickname && u.username"> / </template>
            <template v-if="u.username">{{ u.username }}</template>
          </span>
        </div>
        <UiIconButton
          :icon="u.isFriend ? 'fas fa-check' : 'fas fa-plus'"
          :aria-label="u.isFriend ? '已是好友' : '添加好友'"
          size="sm"
          :disabled="u.isFriend"
          @click.stop="onAddFriend(u)"
        />
      </div>
    </div>
    <UiEmptyState
      v-else
      :icon="query || gradeFilter ? 'fas fa-search' : 'fas fa-spinner fa-spin'"
      :title="query || gradeFilter ? '无匹配结果' : '加载中...'"
    />
  </UiModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { UiAvatar, UiButton, UiDropdown, UiEmptyState, UiIconButton, UiInput, UiModal } from '@/ui'
import { store } from '@/store.js'
import {
  GRADE_LABELS,
  avatarTint,
  getAvatarInitial,
  getGradeColor,
  localGradeColorKey,
  ranklistOrder,
  usersJson,
} from '@/utils.js'

const props = defineProps({
  visible: Boolean,
  initialQuery: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'confirm', 'viewUser'])

const query = ref('')
const gradeFilter = ref('')
const searchRef = ref(null)
const modalOpen = ref(false)

const gradeOptions = [
  { value: '', label: '全部年级' },
  ...Object.entries(GRADE_LABELS).map(([value, label]) => ({ value, label })),
]

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      query.value = props.initialQuery || ''
      gradeFilter.value = ''
      modalOpen.value = true
    } else {
      modalOpen.value = false
    }
  }
)

function focusSearch() {
  searchRef.value?.focus()
}

const users = computed(() => {
  const q = query.value.trim().toLowerCase()
  const gf = gradeFilter.value
  const results = []
  const rankSet = new Set(ranklistOrder)

  const processUser = (uid, user) => {
    const jsonInfo = usersJson?.[uid]
    const name = jsonInfo?.name || ''
    const username = user?.username || ''
    const nickname = user?.nickname || ''
    const isFriend = user?.watchee === true

    if (gf && localGradeColorKey(uid) !== gf) return

    if (q) {
      const haystack = [name, username, nickname, String(uid)].join(' ').toLowerCase()
      if (!haystack.includes(q)) return
    }

    results.push({
      uid,
      realName: name || nickname || username || `User_${uid}`,
      nickname,
      username,
      gradeColor: getGradeColor(uid),
      initial: getAvatarInitial(uid),
      isFriend,
    })
  }

  for (const uid of ranklistOrder) {
    const user = store.users[uid]
    if (user) processUser(uid, user)
  }

  for (const [uidStr, user] of Object.entries(store.users)) {
    const uid = Number(uidStr)
    if (!uid || rankSet.has(uid)) continue
    processUser(uid, user)
  }

  return results
})

function onViewUser(u) {
  emit('viewUser', String(u.uid))
}

function onAddFriend(u) {
  if (u.isFriend) return
  emit('confirm', String(u.uid))
}

function onDirectAdd() {
  const q = query.value.trim()
  if (!q) return
  emit('confirm', q)
  close()
}

function close() {
  modalOpen.value = false
}

function finishClose() {
  emit('update:visible', false)
}
</script>

<style scoped src="../../css/components/addfriend-modal.css"></style>
