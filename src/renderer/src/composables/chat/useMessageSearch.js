import { ref, computed, watch } from 'vue'
import { store } from '../../store.js'
import { displayName, highlightKeyword, parseMsgContent, getMessagePlainText } from '../../utils.js'

function parseMsgType(content) {
  const obj = parseMsgContent(content)
  if (!obj) return 'text'
  if (obj.type === 'sticker') return 'emoji'
  return obj.type || 'text'
}

/**
 * 会话内/全局消息搜索过滤与结果分页。
 */
export function useMessageSearch({ pageType, pageId, messages }) {
  const query = ref('')
  const senderFilter = ref('')
  const msgTypeFilter = ref('')
  const dateAfter = ref('')
  const dateBefore = ref('')
  const searchScope = ref('current')
  const resultLimit = ref(50)

  const isGroup = computed(() => pageType() === 'group')
  const targetGroup = computed(() => store.groups?.[pageId()] || null)

  const hasFilter = computed(() => !!(
    query.value.trim() ||
    senderFilter.value ||
    msgTypeFilter.value ||
    dateAfter.value ||
    dateBefore.value
  ))

  const allMessagesWithConvo = computed(() => {
    const result = []
    for (const [uid, user] of Object.entries(store.users || {})) {
      for (const mid of (user.message_ids || [])) {
        const msg = store.messages?.[mid]
        if (msg) result.push({ ...msg, _convoType: 'user', _convoId: Number(uid) })
      }
    }
    for (const [gid, group] of Object.entries(store.groups || {})) {
      for (const mid of (group.message_ids || [])) {
        const msg = store.messages?.[mid]
        if (msg) result.push({ ...msg, _convoType: 'group', _convoId: Number(gid) })
      }
    }
    return result.sort((a, b) => b.send_time - a.send_time)
  })

  const searchMessages = computed(() => (
    searchScope.value === 'all' ? allMessagesWithConvo.value : messages()
  ))

  const senderCandidates = computed(() => {
    if (!isGroup.value || !targetGroup.value) return []
    const senderUids = new Set(searchMessages.value.map((m) => m.sender))
    return [...senderUids].map((uid) => (
      store.users[uid] || { uid, nickname: 'User_' + uid, username: '', realname: '' }
    ))
  })

  const senderOptions = computed(() => [
    { value: '', label: '全部' },
    ...senderCandidates.value.map((m) => ({
      value: String(m.uid),
      label: displayName(m),
      desc: String(m.uid),
    })),
  ])

  const results = computed(() => {
    const q = query.value.trim().toLowerCase()
    return searchMessages.value.filter((msg) => {
      if (q) {
        const plain = getMessagePlainText(msg.content).toLowerCase()
        const raw = String(msg.content || '').toLowerCase()
        if (!plain.includes(q) && !raw.includes(q)) return false
      }
      if (senderFilter.value && String(msg.sender) !== String(senderFilter.value)) return false
      if (msgTypeFilter.value && parseMsgType(msg.content) !== msgTypeFilter.value) return false
      if (dateAfter.value) {
        const afterTs = new Date(dateAfter.value).getTime() / 1000
        if (msg.send_time < afterTs) return false
      }
      if (dateBefore.value) {
        const beforeTs = (new Date(dateBefore.value).getTime() / 1000) + 86400
        if (msg.send_time >= beforeTs) return false
      }
      return true
    })
  })

  const pagedResults = computed(() => results.value.slice(0, resultLimit.value))

  function resultPreview(msg) {
    const text = getMessagePlainText(msg.content).slice(0, 80)
    return highlightKeyword(text, query.value.trim())
  }

  function getConvoName(msg) {
    if (msg._convoType === 'user') {
      const user = store.users?.[msg._convoId]
      return user ? displayName(user) : `User_${msg._convoId}`
    }
    if (msg._convoType === 'group') {
      return store.groups?.[msg._convoId]?.name || `群${msg._convoId}`
    }
    return ''
  }

  function resetFilters() {
    query.value = ''
    senderFilter.value = ''
    msgTypeFilter.value = ''
    dateAfter.value = ''
    dateBefore.value = ''
    searchScope.value = 'current'
    resultLimit.value = 50
  }

  watch(query, () => { resultLimit.value = 50 })

  return {
    query,
    senderFilter,
    msgTypeFilter,
    dateAfter,
    dateBefore,
    searchScope,
    resultLimit,
    isGroup,
    hasFilter,
    senderCandidates,
    senderOptions,
    results,
    pagedResults,
    resultPreview,
    getConvoName,
    resetFilters,
  }
}
