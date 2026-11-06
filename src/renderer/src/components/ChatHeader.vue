<template>
  <div class="chat-header">
    <div class="header-left">
      <BackButton class="back-icon" title="返回" aria-label="返回" @back="$emit('back')" />
      <template v-if="pageType === 'user' && targetUser">
        <div class="user-info" @click="$emit('openUserInfo', targetUser.uid)">
          <UiAvatar class="header-avatar" :size="32" :color="avatarTint(targetUser.uid)" :name="getAvatarInitial(targetUser.uid)" />
          <h3 :style="{ color: getGradeColor(targetUser.uid) }">{{ displayName(targetUser) }}</h3>
          <UiIconButton
            class="header-watch-btn"
            :icon="targetUser.watchee === true ? 'fas fa-check' : 'fas fa-plus'"
            size="md"
            variant="soft"
            :disabled="targetUser.watchee === true"
            :aria-label="targetUser.watchee === true ? '已关注' : '加关注'"
            :title="targetUser.watchee === true ? '已关注' : '加关注'"
            @click.stop="onWatchClick"
          />
        </div>
      </template>
      <template v-if="pageType === 'group' && targetGroup">
        <div class="user-info" @click="!targetGroup.exited && $emit('openGroupSettings', pageId)">
          <UiAvatar class="header-avatar" :size="32" :color="avatarTint('group:' + (targetGroup.name || ''))" :name="targetGroup.name || '群'" />
          <h3>
            {{ targetGroup.name }}
            <UiBadge v-if="targetGroup.exited" class="exited-badge" variant="outline" size="sm">已退出</UiBadge>
            <UiBadge v-if="targetGroup.blocked" class="blocked-badge" variant="danger" size="sm">已屏蔽</UiBadge>
          </h3>
          <UiBadge v-if="targetGroup.mentioned" class="chat-mention-badge" variant="brand" size="sm">[有人@你]</UiBadge>
        </div>
      </template>
    </div>
    <template v-if="pageType === 'user' && targetUser">
      <div class="header-actions">
        <UiIconButton icon="fas fa-search" size="md" variant="ghost" aria-label="搜索" title="搜索" @click="$emit('toggleSearch')" />
        <UiIconButton icon="fas fa-ellipsis-v" size="md" variant="ghost" aria-label="更多" title="更多" @click="$emit('openUserInfo', targetUser.uid)" />
      </div>
    </template>
    <template v-if="pageType === 'group' && targetGroup">
      <div class="header-actions">
        <UiIconButton icon="fas fa-search" size="md" variant="ghost" aria-label="搜索" title="搜索" @click="$emit('toggleSearch')" />
        <UiIconButton v-if="!targetGroup.exited" icon="fas fa-ellipsis-v" size="md" variant="ghost" aria-label="群设置" title="群设置" @click="$emit('openGroupSettings', pageId)" />
      </div>
    </template>
  </div>
</template>

<script setup>
import BackButton from './BackButton.vue';
import { UiAvatar, UiBadge, UiIconButton } from '../ui';
import { displayName, getGradeColor, getAvatarInitial, avatarTint } from '../utils.js';

const props = defineProps({
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  targetUser: { type: Object, default: null },
  targetGroup: { type: Object, default: null }
});

const emit = defineEmits(['back', 'openUserInfo', 'openGroupSettings', 'toggleSearch', 'addfriend']);

function onWatchClick() {
  if (props.targetUser?.watchee) return // 已关注
  emit('addfriend', props.targetUser.uid)
}
</script>

<style scoped src="../css/chat-header.css"></style>

