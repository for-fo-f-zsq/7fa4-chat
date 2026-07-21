<template>
  <div class="search-panel" v-if="visible">
    <div class="search-bar">
      <div class="search-field">
        <label class="search-label">关键词</label>
        <input class="search-input" v-model="query" placeholder="搜索消息..." ref="inputEl" />
      </div>
      <div class="search-field">
        <label class="search-label">范围</label>
        <div class="custom-select" :class="{ open: scopeOpen }" @click="scopeOpen = !scopeOpen" v-click-outside="() => scopeOpen = false">
          <div class="custom-select-trigger">
            <span>{{ searchScope === 'all' ? '全部会话' : '当前会话' }}</span>
            <i class="fas fa-chevron-down custom-select-arrow"></i>
          </div>
          <div class="custom-select-dropdown" v-if="scopeOpen">
            <div class="custom-select-option" :class="{ active: searchScope === 'current' }" @click.stop="searchScope = 'current'; scopeOpen = false"><span>当前会话</span></div>
            <div class="custom-select-option" :class="{ active: searchScope === 'all' }" @click.stop="searchScope = 'all'; scopeOpen = false"><span>全部会话</span></div>
          </div>
        </div>
      </div>
      <div class="search-field" v-if="isGroup && searchScope === 'current' && senderCandidates.length">
        <label class="search-label">发送者</label>
        <div class="custom-select" :class="{ open: senderOpen, dropup: senderDropup }" @click="toggleSenderSelect" v-click-outside="() => senderOpen = false">
          <div class="custom-select-trigger">
            <span>{{ currentSenderLabel }}</span>
            <i class="fas fa-chevron-down custom-select-arrow"></i>
          </div>
          <div class="custom-select-dropdown" :class="{ dropup: senderDropup }" v-if="senderOpen">
            <div class="custom-select-search" @click.stop>
              <input class="custom-select-search-input" v-model="senderSearchQuery" placeholder="搜索发送者..." ref="senderSearchInput" />
            </div>
            <div class="custom-select-options">
              <div class="custom-select-option" :class="{ active: !senderFilter }" @click.stop="selectSender('')"><span>全部</span></div>
              <div class="custom-select-option" v-for="m in searchedSenders" :key="m.uid" :class="{ active: String(senderFilter) === String(m.uid) }" @click.stop="selectSender(m.uid)"><span>{{ displayName(m) }}</span></div>
              <div v-if="!searchedSenders.length" class="custom-select-empty">无匹配结果</div>
            </div>
          </div>
        </div>
      </div>
      <div class="search-field">
        <label class="search-label">类型</label>
        <div class="custom-select" :class="{ open: typeOpen, dropup: typeDropup }" @click="toggleTypeSelect" v-click-outside="() => typeOpen = false">
          <div class="custom-select-trigger">
            <span>{{ currentTypeLabel }}</span>
            <i class="fas fa-chevron-down custom-select-arrow"></i>
          </div>
          <div class="custom-select-dropdown" :class="{ dropup: typeDropup }" v-if="typeOpen">
            <div class="custom-select-option" :class="{ active: !msgTypeFilter }" @click.stop="selectType('')"><span>全部</span></div>
            <div class="custom-select-option" :class="{ active: msgTypeFilter === 'text' }" @click.stop="selectType('text')"><span>文本</span></div>
            <div class="custom-select-option" :class="{ active: msgTypeFilter === 'file' }" @click.stop="selectType('file')"><span>文件</span></div>
            <div class="custom-select-option" :class="{ active: msgTypeFilter === 'emoji' }" @click.stop="selectType('emoji')"><span>表情</span></div>
          </div>
        </div>
      </div>
      <div class="search-field">
        <label class="search-label">起始日期</label>
        <input class="search-date" type="date" v-model="dateAfter" />
      </div>
      <div class="search-field">
        <label class="search-label">结束日期</label>
        <input class="search-date" type="date" v-model="dateBefore" />
      </div>
      <button class="search-close-btn" @click="$emit('close')"><i class="fas fa-times"></i></button>
    </div>
    <div class="search-results" v-if="hasFilter && pagedResults.length">
      <div class="search-results-header">找到 {{ results.length }} 条消息</div>
      <div
        v-for="msg in pagedResults"
        :key="msg.id"
        class="search-result-item"
        @click="onJump(msg)"
      >
        <span class="search-result-sender" v-if="searchScope === 'all'">[{{ getConvoName(msg) }}] </span>
        <span class="search-result-sender">{{ displayName(msgSenderUser(msg)) }}</span>
        <span class="search-result-content" v-html="resultPreview(msg)"></span>
        <span class="search-result-time">{{ gettime2(msg.send_time) }}</span>
      </div>
      <div v-if="results.length > resultLimit" class="search-more-btn" @click="resultLimit += 50">查看更多 ({{ results.length - resultLimit }} 条)</div>
    </div>
    <div class="search-results" v-else-if="hasFilter && !results.length">
      <div class="search-results-header">无匹配结果</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { store } from '../store.js'
import { displayName, gettime2, highlightKeyword, getConvoKey } from '../utils.js'
import { vClickOutside } from '../composables/vClickOutside.js'

const props = defineProps({
  visible: Boolean,
  pageType: String,
  pageId: [String, Number],
  messages: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'jump'])

const query = ref('')
const senderFilter = ref('')
const msgTypeFilter = ref('')
const dateAfter = ref('')
const dateBefore = ref('')
const inputEl = ref(null)
const searchScope = ref('current')
const resultLimit = ref(50)

const scopeOpen = ref(false)
const senderOpen = ref(false)
const senderDropup = ref(false)
const typeOpen = ref(false)
const typeDropup = ref(false)
const senderSearchQuery = ref('')
const senderSearchInput = ref(null)

const isGroup = computed(() => props.pageType === 'group')

const hasFilter = computed(() => {
  return !!(query.value.trim() || senderFilter.value || msgTypeFilter.value || dateAfter.value || dateBefore.value)
})

const targetGroup = computed(() => store.groups?.[props.pageId] || null)

// 全局搜索时聚合所有会话的消息
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

const searchMessages = computed(() => {
  return searchScope.value === 'all' ? allMessagesWithConvo.value : props.messages
})

const senderCandidates = computed(() => {
  if (!isGroup.value || !targetGroup.value) return []
  const senderUids = new Set(searchMessages.value.map(m => m.sender))
  return [...senderUids].map(uid => store.users[uid] || { uid, nickname: 'User_' + uid, username: '', realname: '' })
})

const searchedSenders = computed(() => {
  const q = senderSearchQuery.value.trim().toLowerCase()
  if (!q) return senderCandidates.value
  return senderCandidates.value.filter(m => {
    const name = displayName(m).toLowerCase()
    const uid = String(m.uid)
    return name.includes(q) || uid.includes(q)
  })
})

const typeOptions = [
  { value: '', label: '全部' },
  { value: 'text', label: '文本' },
  { value: 'file', label: '文件' },
  { value: 'emoji', label: '表情' },
  { value: 'sticker', label: '表情' }
]

const currentSenderLabel = computed(() => {
  if (!senderFilter.value) return '全部'
  const found = senderCandidates.value.find(m => String(m.uid) === String(senderFilter.value))
  return found ? displayName(found) : '全部'
})

const currentTypeLabel = computed(() => {
  const found = typeOptions.find(o => o.value === msgTypeFilter.value)
  return found?.label || '全部'
})

function checkDropup(el) {
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  return spaceBelow < 180
}

function toggleSenderSelect(e) {
  senderOpen.value = !senderOpen.value
  if (senderOpen.value) {
    senderDropup.value = checkDropup(e.currentTarget)
    senderSearchQuery.value = ''
    nextTick(() => senderSearchInput.value?.focus())
  }
}

function toggleTypeSelect(e) {
  typeOpen.value = !typeOpen.value
  if (typeOpen.value) typeDropup.value = checkDropup(e.currentTarget)
}

function selectSender(uid) { senderFilter.value = uid; senderOpen.value = false }
function selectType(type) { msgTypeFilter.value = type; typeOpen.value = false }

function parseMsgType(content) {
  try {
    let obj = JSON.parse(content)
    if (obj.type === 'sticker') obj.type = 'emoji'
    return obj.type || 'text'
  } catch {}
  return 'text'
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

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  return searchMessages.value.filter(msg => {
    if (q) {
      let matched = false
      try {
        const obj = JSON.parse(msg.content)
        if (obj.type === 'text') matched = obj.content.toLowerCase().includes(q)
        else if (obj.type === 'file') matched = (obj.name || '').toLowerCase().includes(q)
        else if (obj.type === 'emoji') matched = obj.content.toLowerCase().includes(q)
        else if (obj.type === 'sticker') matched = obj.name.toLowerCase().includes(q)
      } catch {}
      if (!matched && !msg.content.toLowerCase().includes(q)) return false
    }
    if (senderFilter.value && msg.sender !== Number(senderFilter.value) && msg.sender !== senderFilter.value) return false
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
  const q = query.value.trim()
  let text = ''
  try {
    const obj = JSON.parse(msg.content)
    if (obj.type === 'text') text = obj.content.slice(0, 80)
    else if (obj.type === 'file') text = '📄 ' + (obj.name || '')
    else if (obj.type === 'emoji') text = obj.content
    else if (obj.type === 'sticker') text = `🖼️${obj.name}`
    else text = msg.content.slice(0, 80)
  } catch { text = msg.content.slice(0, 80) }
  return highlightKeyword(text, q)
}

function msgSenderUser(msg) {
  return store.users?.[msg.sender] || { uid: msg.sender }
}

function onJump(msg) {
  if (searchScope.value === 'all' && msg._convoType && msg._convoId) {
    emit('jump', { msgId: msg.id, convoType: msg._convoType, convoId: msg._convoId })
  } else {
    emit('jump', msg.id)
  }
}

function resetFilters() {
  query.value = ''
  senderFilter.value = ''
  msgTypeFilter.value = ''
  dateAfter.value = ''
  dateBefore.value = ''
  senderOpen.value = false
  typeOpen.value = false
  scopeOpen.value = false
  searchScope.value = 'current'
  resultLimit.value = 50
}

watch(() => props.visible, (v) => {
  if (v) nextTick(() => inputEl.value?.focus())
  else resetFilters()
})

watch(query, () => { resultLimit.value = 50 })

function focusInput() { inputEl.value?.focus() }

defineExpose({ focusInput })
</script>

<style scoped>
.search-more-btn {
  text-align: center;
  padding: 8px;
  color: var(--accent, #3C8CE7);
  cursor: pointer;
  font-size: 13px;
}
.search-more-btn:hover { text-decoration: underline; }
</style>
