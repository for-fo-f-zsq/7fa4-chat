<template>
  <UiModal v-model:open="open" size="sm" :title="title" @opened="focus" @closed="$emit('close')">
    <div class="forward-search">
      <UiInput ref="searchInput" v-model="searchQuery" size="sm" placeholder="搜索联系人/群聊..." />
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
    <template #footer>
      <UiButton variant="primary" :disabled="!selectedId" @click="doSend">发送</UiButton>
    </template>
  </UiModal>
</template>

<style scoped src="../../css/components/forward-modal.css"></style>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { store } from '../../store.js';
import { displayName } from '../../utils.js';
import UiModal from '../../ui/UiModal/UiModal.vue';
import UiInput from '../../ui/UiInput/UiInput.vue';
import UiButton from '../../ui/UiButton/UiButton.vue';

const props = defineProps({
  msgContent: { type: String, default: '' },
  title: { type: String, default: '转发消息' }
});

const emit = defineEmits(['close', 'forward']);

const selectedType = ref('');
const selectedId = ref(null);
const searchQuery = ref('');
const searchInput = ref(null);

// 关闭时先播 UiModal 离场，after-leave 后再通知父级卸载
const open = ref(false);

onMounted(() => {
  nextTick(() => {
    open.value = true;
  });
});

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
  if (!selectedId.value) return;
  emit('forward', { type: selectedType.value, targetId: selectedId.value, msgContent: props.msgContent || '' });
}

function focus() {
  searchInput.value?.$el?.querySelector?.('input')?.focus();
}

defineExpose({ focus });
</script>
