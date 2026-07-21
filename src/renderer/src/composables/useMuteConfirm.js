import { ref } from 'vue'

export function useMuteConfirm(submitFn) {
  const muteModalVisible = ref(false)
  const pendingMuteMemberId = ref(null)

  function requestMute(memberId) {
    pendingMuteMemberId.value = memberId
    muteModalVisible.value = true
  }

  function onMuteMinutesConfirm(minutesStr) {
    const minutes = parseInt(minutesStr, 10)
    if (isNaN(minutes) || minutes < 0) {
      alert('请输入有效的分钟数')
      return
    }
    if (pendingMuteMemberId.value) {
      submitFn({
        type: 'mute_member',
        targetId: pendingMuteMemberId.value,
        muteMinutes: minutes
      })
      pendingMuteMemberId.value = null
    }
    muteModalVisible.value = false
  }

  return { muteModalVisible, pendingMuteMemberId, requestMute, onMuteMinutesConfirm }
}
