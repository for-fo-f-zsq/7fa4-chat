<template>
  <div ref="anchorEl" class="group-action-menu__anchor" :style="anchorStyle"></div>
  <UiMenu
    :items="menuItems"
    :open="visible"
    :anchor="anchorEl"
    :offset="0"
    placement="bottom"
    @select="onSelect"
    @close="$emit('close')"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import { store } from '../../store.js'
import UiMenu from '../../ui/UiMenu/UiMenu.vue'

const props = defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  gid: Number,
  mid: Number,
})

const emit = defineEmits(['close', 'action'])

// 0 尺寸锚点：把右键/点击位置交给 UiMenu 做 fixed 定位与视口翻转
const anchorEl = ref(null)
const anchorStyle = computed(() => ({
  left: `${props.x || 0}px`,
  top: `${props.y || 0}px`,
}))

const actionList = computed(() => {
  const member = store.groups?.[props.gid]?.users?.filter(u => u.user_id == props.mid)[0]
  const self = store.groups?.[props.gid]?.users?.filter(u => u.user_id == store.self.uid)[0]
  if (!member) return []
  const selftype = self.type || 'Member'
  const memType = member.type || 'Member'
  const isSelf = String(member.user_id) === String(self.user_id)
  const list = []
  if (!isSelf) {
    if (selftype === 'Owner') {
      if (memType !== 'Owner') {
        list.push({ value: 'del_member', label: '踢出成员', icon: 'fas fa-user-minus' })
        list.push({ value: 'mute_member', label: '禁言成员', icon: 'fas fa-microphone-slash' })
      }
      if (memType === 'Member') {
        list.push({ value: 'add_administrator', label: '设为管理员', icon: 'fas fa-user-shield' })
      }
      if (memType === 'Administrator') {
        list.push({ value: 'del_administrator', label: '取消管理员', icon: 'fas fa-user-times' })
      }
      if (memType !== 'Owner') {
        list.push({ value: 'give_owner', label: '转让群主', icon: 'fas fa-crown' })
      }
    } else if (selftype === 'Administrator' && memType === 'Member') {
      list.push({ value: 'del_member', label: '踢出成员', icon: 'fas fa-user-minus' })
      list.push({ value: 'mute_member', label: '禁言成员', icon: 'fas fa-microphone-slash' })
    }
  } else {
    if (selftype === 'Owner') {
      list.push({ value: 'dissolve', label: '解散群聊', icon: 'fas fa-trash-alt' })
    } else {
      list.push({ value: 'leave', label: '退出群聊', icon: 'fas fa-sign-out-alt' })
    }
  }

  list.push({ value: 'view_profile', label: '用户信息', icon: 'fas fa-user-circle' })
  list.push({ value: 'private_chat', label: '私信', icon: 'fas fa-comment' })

  return list
})

const menuItems = computed(() =>
  actionList.value.map(item => ({ key: item.value, label: item.label, icon: item.icon }))
)

function onSelect(key) {
  emit('action', { type: key, targetId: props.mid })
}
</script>

<style scoped src="../../css/components/group-action-menu.css"></style>
