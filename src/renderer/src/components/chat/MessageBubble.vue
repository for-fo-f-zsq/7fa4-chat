<template>
  <div
    class="msg-row"
    :class="[
      isSelf ? 'right' : 'left',
      {
        'multi-select-active': multiSelectMode,
        'motion-message-in': isSelf,
      },
    ]"
    :data-msg-id="msg.id"
  >
    <UiCheckbox
      v-if="multiSelectMode && !isPat"
      class="msg-checkbox-wrap"
      :modelValue="selected"
      aria-label="选择消息"
      @update:modelValue="$emit('toggleSelect', msg.id)"
      @click.stop
    />

    <div
      class="msg-avatar"
      @click.stop="!isSelf && $emit('avatarClick', msg.sender)"
      @dblclick="!isSelf && $emit('avatarDblClick', msg.sender)"
      @contextmenu.prevent="!isSelf && pageType === 'group' && $emit('groupMenu', $event, msg.sender)"
    >
      <UiAvatar :name="avatarInitial" :color="avatarBg" :size="36" shape="rounded" />
    </div>

    <div class="bubble-wrap" :class="{ 'bubble-wrap-self': isSelf }">
      <div class="bubble-header">
        <span
          v-if="!isSelf"
          class="name"
          :style="{ color: gradeColor }"
          :title="gradeLabel"
          @click.stop="$emit('avatarClick', msg.sender)"
          @dblclick="$emit('avatarDblClick', msg.sender)"
          @contextmenu.prevent="pageType === 'group' && $emit('groupMenu', $event, msg.sender)"
        >{{ senderName }}</span>
        <span class="time">{{ timeText }}</span>
      </div>

      <div
        class="bubble"
        :class="{ collapsed: clamped }"
        @contextmenu.prevent="$emit('contextMenu', $event, msg)"
      >
        <PollCard
          v-if="poll"
          :poll="poll.def"
          :result="poll.result"
          :own="isSelf"
          :voting="voting"
          :name-of="pollVoterName"
          @vote="(pick, custom) => $emit('vote', msg, pick, custom)"
        />
        <div v-else class="bubble-content luogu-md" v-html="renderedHtml"></div>
      </div>

      <button
        v-if="expandable"
        type="button"
        class="expand-btn"
        :aria-expanded="expanded ? 'true' : 'false'"
        @click.stop="$emit('toggleExpand', msg)"
      >{{ expanded ? '收起' : '展开' }}</button>
    </div>
  </div>
</template>

<script setup>
import { UiAvatar, UiCheckbox } from '@/ui'
import PollCard from './PollCard.vue'

defineProps({
  msg: { type: Object, required: true },
  pageType: { type: String, required: true },
  isSelf: { type: Boolean, default: false },
  multiSelectMode: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  isPat: { type: Boolean, default: false },
  avatarInitial: { type: String, default: '' },
  avatarBg: { type: String, default: '' },
  senderName: { type: String, default: '' },
  gradeColor: { type: String, default: '' },
  gradeLabel: { type: String, default: '' },
  timeText: { type: String, default: '' },
  poll: { type: Object, default: null },
  voting: { type: Boolean, default: false },
  pollVoterName: { type: Function, required: true },
  renderedHtml: { type: String, default: '' },
  clamped: { type: Boolean, default: false },
  expandable: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
})

defineEmits([
  'toggleSelect',
  'avatarClick',
  'avatarDblClick',
  'groupMenu',
  'contextMenu',
  'vote',
  'toggleExpand',
])
</script>
