import { computed, unref } from 'vue'
import { store } from '../store.js'

// 计算当前会话的消息列表（按 id 排序、过滤无效项）。
// pageType / pageId 可以是 ref 或 getter 函数。
// 返回 { target, currentMessages, currentMessagesLength }：
//   - target: 当前会话对象（user 或 group），无则 null
//   - currentMessages: 已排序过滤的消息数组
//   - currentMessagesLength: 原始 message_ids 长度（无需排序/映射，用于分页判断）
export function useCurrentMessages(pageType, pageId) {
  const resolve = (v) => (typeof v === 'function' ? v() : unref(v))

  const target = computed(() => {
    const t = resolve(pageType)
    const id = resolve(pageId)
    if (!id) return null
    if (t === 'user') return store.users?.[id]
    if (t === 'group') return store.groups?.[id]
    // 'chat' 模式：根据 id 在 users 和 groups 中查找
    return store.users?.[id] || store.groups?.[id] || null
  })

  const currentMessages = computed(() => {
    const item = target.value
    if (!item || !item.message_ids) return []
    return item.message_ids.slice().sort((a, b) => a - b).map(id => store.messages[id]).filter(Boolean)
  })

  const currentMessagesLength = computed(() => {
    const item = target.value
    if (!item || !item.message_ids) return 0
    return item.message_ids.length
  })

  return { target, currentMessages, currentMessagesLength }
}
