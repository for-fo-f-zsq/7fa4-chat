<template>
  <div v-if="visible" class="addfriend-overlay" @click.self="close">
    <div class="addfriend-modal">
      <div class="addfriend-header">
        <h4>添加好友</h4>
        <button class="addfriend-close" @click="close"><i class="fas fa-times"></i></button>
      </div>
      <div class="addfriend-search">
        <input
          ref="searchRef"
          v-model="query"
          type="text"
          placeholder="搜索用户名 / 昵称 / 真名 / UID"
          class="addfriend-input"
        />
        <select v-model="gradeFilter" class="addfriend-grade-select">
          <option value="">全部年级</option>
          <option v-for="g in gradeOptions" :key="g.key" :value="g.key">{{ g.label }}</option>
        </select>
      </div>
      <div class="addfriend-list" v-if="filteredUsers.length > 0">
        <div
          v-for="u in filteredUsers"
          :key="u.uid"
          class="addfriend-item"
          :class="{ 'is-friend': u.isFriend }"
          @click="onViewUser(u)"
        >
          <div class="addfriend-item-avatar">
            <div class="avatar-placeholder-sm">{{ u.initial }}</div>
          </div>
          <div class="addfriend-item-info">
            <span class="addfriend-item-name" :style="{ color: u.gradeColor }">{{ u.realName }}</span>
            <span class="addfriend-item-detail">
              <template v-if="u.uid">{{ u.uid }}</template>
              <template v-if="u.nickname || u.username"> / </template>
              <template v-if="u.nickname">{{ u.nickname }}</template>
              <template v-if="u.nickname && u.username"> / </template>
              <template v-if="u.username">{{ u.username }}</template>
            </span>
          </div>
          <div class="addfriend-item-action" @click.stop="onAddFriend(u)">
            <i v-if="u.isFriend" class="fas fa-check"></i>
            <i v-else class="fas fa-plus"></i>
          </div>
        </div>
      </div>
      <div class="addfriend-empty" v-else-if="query || gradeFilter">
        无匹配结果
      </div>
      <div class="addfriend-empty" v-else>
        加载中...
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { store } from '../store.js'
import { getGradeColor, getGradeLabel, getAvatarInitial, GRADE_LABELS, ranklistOrder, usersJson } from '../utils.js'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible', 'confirm', 'viewUser'])

const query = ref('')
const gradeFilter = ref('')
const searchRef = ref(null)

const gradeOptions = Object.entries(GRADE_LABELS).map(([key, label]) => ({ key, label }))

watch(() => props.visible, async (newVal) => {
  if (newVal) {
    query.value = ''
    gradeFilter.value = ''
    await nextTick()
    searchRef.value?.focus()
  }
})

const filteredUsers = computed(() => {
  const q = query.value.trim().toLowerCase()
  const gf = gradeFilter.value

  const results = []
  const rankSet = new Set(ranklistOrder)

  const processUser = (uid, user) => {
    const jsonInfo = usersJson?.[uid]
    const name = jsonInfo?.name || ''
    const username = user?.username || ''
    const nickname = user?.nickname || ''
    const isFriend = user && user.show !== false

    if (gf) {
      const colorKey = jsonInfo?.colorKey || ''
      if (colorKey !== gf) return
    }

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
      isFriend
    })
  }

  // 先按 ranklist 顺序
  for (const uid of ranklistOrder) {
    const user = store.users[uid]
    if (!user) continue
    processUser(uid, user)
  }

  // 不在 ranklist 中的用户追加到末尾
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

function close() {
  emit('update:visible', false)
}
</script>
