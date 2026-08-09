<template>
  <div class="chat-header">
    <div class="header-left">
      <div class="nav-icon button back-icon" @click="$emit('back')" title="返回"><i class="fas fa-arrow-left"></i></div>
      <template v-if="pageType === 'user' && targetUser">
        <div class="user-info" @click="$emit('openUserInfo', targetUser.uid)">
          <div class="header-avatar">
            <div class="avatar-placeholder-sm">{{ getAvatarInitial(targetUser.uid) }}</div>
          </div>
          <h3 :style="{ color: getGradeColor(targetUser.uid) }">{{ displayName(targetUser) }}</h3>
          <div
            class="header-watch-btn"
            :class="{ watched: targetUser.watchee === true }"
            :title="targetUser.watchee === true ? '已关注' : '加关注'"
            @click.stop="onWatchClick"
          >
            <i v-if="targetUser.watchee === true" class="fas fa-check"></i>
            <i v-else class="fas fa-plus"></i>
          </div>
        </div>
      </template>
      <template v-if="pageType === 'group' && targetGroup">
        <div class="user-info" @click="!targetGroup.exited && $emit('openGroupSettings', pageId)">
          <div class="header-avatar">
            <div class="avatar-placeholder-sm">{{ targetGroup.name ? targetGroup.name.charAt(0) : '群' }}</div>
          </div>
          <h3>{{ targetGroup.name }}<span v-if="targetGroup.exited" class="exited-badge">(已退出)</span><span v-if="targetGroup.blocked" class="blocked-badge">(已屏蔽)</span></h3>
          <span v-if="targetGroup.mentioned" class="chat-mention-badge">[有人@你]</span>
        </div>
      </template>
    </div>
    <template v-if="pageType === 'user' && targetUser">
      <div class="header-actions">
        <div class="nav-icon button group-settings-icon" @click="$emit('toggleSearch')"><i class="fas fa-search"></i></div>
        <div class="nav-icon button group-settings-icon" @click="$emit('openUserInfo', targetUser.uid)"><i class="fas fa-ellipsis-v"></i></div>
      </div>
    </template>
    <template v-if="pageType === 'group' && targetGroup">
      <div class="header-actions">
        <div class="nav-icon button group-settings-icon" @click="$emit('toggleSearch')"><i class="fas fa-search"></i></div>
        <div v-if="!targetGroup.exited" class="nav-icon button group-settings-icon" @click="$emit('openGroupSettings', pageId)"><i class="fas fa-ellipsis-v"></i></div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { displayName, getGradeColor, getAvatarInitial } from '../utils.js';

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
