<template>
  <div class="forward-overlay" @click.self="$emit('close')">
    <div class="forward-modal">
      <div class="forward-header">
        <span>转发消息</span>
        <button class="preview-close" @click="$emit('close')"><i class="fas fa-times"></i></button>
      </div>
      <div class="forward-search">
        <input class="forward-search-input" v-model="searchQuery" placeholder="搜索联系人/群聊..." ref="searchInput" />
      </div>
      <div class="forward-list">
        <div
          v-for="user in searchedTargets"
          :key="'u-'+user.uid"
          class="forward-item"
          :class="{ active: selectedType === 'user' && selectedId === user.uid }"
          @click="selectedType = 'user'; selectedId = user.uid"
        >
          <i class="fas fa-user"></i> {{ displayName(user) }}
        </div>
        <div
          v-for="group in searchedGroups"
          :key="'g-'+group.gid"
          class="forward-item"
          :class="{ active: selectedType === 'group' && selectedId === group.gid }"
          @click="selectedType = 'group'; selectedId = group.gid"
        >
          <i class="fas fa-users"></i> {{ group.name }}
        </div>
        <div v-if="!searchedTargets.length && !searchedGroups.length" class="forward-empty">无匹配结果</div>
      </div>
      <button class="forward-send-btn" :disabled="!selectedId" @click="doSend">发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import { store } from '../store.js';
import { displayName } from '../utils.js';

const props = defineProps({
  msgContent: { type: String, default: '' }
});

const emit = defineEmits(['close', 'forward']);

const selectedType = ref('');
const selectedId = ref(null);
const searchQuery = ref('');
const searchInput = ref(null);

const forwardTargets = computed(() => Object.values(store.users || {}).filter(u => u.watcher));
const forwardGroups = computed(() => Object.values(store.groups || {}).filter(g => !g.exited));

const searchedTargets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return forwardTargets.value;
  return forwardTargets.value.filter(u => {
    const name = displayName(u).toLowerCase();
    const uid = String(u.uid);
    return name.includes(q) || uid.includes(q);
  });
});

const searchedGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return forwardGroups.value;
  return forwardGroups.value.filter(g => {
    const name = (g.name || '').toLowerCase();
    const gid = String(g.gid);
    return name.includes(q) || gid.includes(q);
  });
});

function doSend() {
  if (!selectedId.value || !props.msgContent) return;
  emit('forward', { type: selectedType.value, targetId: selectedId.value, msgContent: props.msgContent });
}

function focus() {
  nextTick(() => searchInput.value?.focus());
}

defineExpose({ focus });
</script>
