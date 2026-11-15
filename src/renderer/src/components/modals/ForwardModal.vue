<template>
  <UiModal v-model:open="open" size="sm" :title="title" @opened="focus" @closed="$emit('close')">
    <div class="forward-search">
      <UiInput
        ref="searchInput"
        v-model="searchQuery"
        size="sm"
        clearable
        prefix-icon="fas fa-search"
        placeholder="搜索联系人/群聊..."
      />
    </div>
    <div v-if="searchedTargets.length || searchedGroups.length" class="forward-list">
      <div
        v-for="user in searchedTargets"
        :key="'u-' + user.uid"
        class="p-list-row p-list-row--interactive forward-item"
        :class="{ active: selectedType === 'user' && selectedId === user.uid }"
        @click="selectTarget('user', user.uid)"
      >
        <UiAvatar shape="rounded" size="sm" :color="avatarTint(user.uid)" :name="getAvatarInitial(user.uid)" />
        <span class="p-list-row__main forward-item-name">{{ displayName(user) }}</span>
        <i v-if="selectedType === 'user' && selectedId === user.uid" class="fas fa-check forward-item-check" aria-hidden="true"></i>
      </div>
      <div
        v-for="group in searchedGroups"
        :key="'g-' + group.gid"
        class="p-list-row p-list-row--interactive forward-item"
        :class="{ active: selectedType === 'group' && selectedId === group.gid }"
        @click="selectTarget('group', group.gid)"
      >
        <UiAvatar shape="rounded" size="sm" :color="avatarTint('group:' + (group.name || ''))" :name="group.name || '群'" />
        <span class="p-list-row__main forward-item-name">{{ group.name }}</span>
        <i v-if="selectedType === 'group' && selectedId === group.gid" class="fas fa-check forward-item-check" aria-hidden="true"></i>
      </div>
    </div>
    <UiEmptyState v-else icon="fas fa-search" title="无匹配结果" />
    <template #footer>
      <UiButton variant="secondary" @click="open = false">取消</UiButton>
      <UiButton variant="primary" :disabled="!selectedId" @click="doSend">发送</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { UiAvatar, UiButton, UiEmptyState, UiInput, UiModal } from '@/ui'
import { store } from '@/store.js'
import { avatarTint, displayName, getAvatarInitial } from '@/utils.js'

const props = defineProps({
  msgContent: { type: String, default: '' },
  title: { type: String, default: '转发消息' },
})

const emit = defineEmits(['close', 'forward'])

const selectedType = ref('')
const selectedId = ref(null)
const searchQuery = ref('')
const searchInput = ref(null)
const open = ref(false)

onMounted(() => {
  nextTick(() => {
    open.value = true
  })
})

const forwardTargets = computed(() => Object.values(store.users || {}).filter((u) => u.watcher))
const forwardGroups = computed(() => Object.values(store.groups || {}).filter((g) => !g.exited))

const searchedTargets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return forwardTargets.value
  return forwardTargets.value.filter(
    (u) => displayName(u).toLowerCase().includes(q) || String(u.uid).includes(q)
  )
})

const searchedGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return forwardGroups.value
  return forwardGroups.value.filter(
    (g) => (g.name || '').toLowerCase().includes(q) || String(g.gid).includes(q)
  )
})

function selectTarget(type, id) {
  selectedType.value = type
  selectedId.value = id
}

function doSend() {
  if (!selectedId.value) return
  emit('forward', {
    type: selectedType.value,
    targetId: selectedId.value,
    msgContent: props.msgContent || '',
  })
}

function focus() {
  searchInput.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped src="../../css/components/forward-modal.css"></style>
