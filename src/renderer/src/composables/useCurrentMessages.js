import { computed, unref } from 'vue'
import { store } from '../store.js'

// 计算当前会话的消息列表（按 id 排序、过滤无效项、去重）。
// pageType / pageId 可以是 ref 或 getter 函数。
// 返回 { target, currentMessages, currentMessagesLength }：
//   - target: 当前会话对象（user 或 group），无则 null
//   - currentMessages: 已排序过滤的消息数组（引用稳定，见下）
//   - currentMessagesLength: 实际可渲染的消息条数（去重/过滤后，用于分页判断）
//
// 引用稳定性是该文件的核心契约：
//   MessageList 用 currentMessages 作为 v-for 数据源，只要这个数组换了引用，整屏消息
//   气泡就会重新 patch 一遍。因此这里做两件事：
//     1) 依赖尽量精确——只在「当前会话对象的 message_ids」和「这些 id 对应的消息对象」
//        上取值，别的会话、别的字段（unread/lastSendTime/connStatus…）不会让它重跑；
//     2) 内容不变就返回上一次的数组引用（逐项 === 比较），历史翻页/其他会话新消息造成的
//        重跑不会再把整个列表打回重渲染。
// 另外 message_ids 常见是「已升序、只追加」的状态，此时跳过 slice+sort 的整份拷贝。
export function useCurrentMessages(pageType, pageId) {
  const resolve = (v) => (typeof v === 'function' ? v() : unref(v))

  // 每个实例一份稳定空数组：空会话不返回新引用。
  const emptyList = []

  const target = computed(() => {
    const t = resolve(pageType)
    const id = resolve(pageId)
    if (!id) return null
    if (t === 'user') return store.users?.[id]
    if (t === 'group') return store.groups?.[id]
    // 'chat' 模式：根据 id 在 users 和 groups 中查找
    return store.users?.[id] || store.groups?.[id] || null
  })

  // 上一次的输出，用于保持引用稳定；_prevIds 记录上次看到的 message_ids 数组，
  // 用于判断「还是同一个数组、长度没变」这类可直接复用的场景。
  let prevOut = emptyList
  let prevIdsRef = null
  let prevIdsLen = -1
  let prevSortedRef = null

  const currentMessages = computed(() => {
    const item = target.value
    const ids = item && Array.isArray(item.message_ids) ? item.message_ids : null
    if (!ids || ids.length === 0) {
      prevIdsRef = ids
      prevIdsLen = 0
      prevSortedRef = null
      return emptyList
    }

    // 1) 取升序 id 列表：优先零拷贝（已升序时直接复用原数组），否则拷贝后排序。
    //    常见形态是「升序 + 只追加」，这时连 sort 都不做；非升序时若元素逐个都与上次的
    //    排序结果相同（纯 O(n) 比较、不分配），也可以直接复用上次排好序的副本。
    let ascending = true
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] < ids[i - 1]) { ascending = false; break }
    }
    let sorted
    if (ascending) {
      sorted = ids
    } else if (ids === prevIdsRef && ids.length === prevIdsLen && prevSortedRef) {
      let unchanged = prevSortedRef.length === ids.length
      if (unchanged) {
        for (let i = 0; i < ids.length; i++) {
          if (ids[i] !== prevSortedRef[i]) { unchanged = false; break }
        }
      }
      sorted = unchanged ? prevSortedRef : ids.slice().sort((a, b) => a - b)
    } else {
      sorted = ids.slice().sort((a, b) => a - b)
    }

    // 2) 映射到消息对象：逐个 id 读 store.messages[id]，把依赖收敛到「这些 key」。
    //    同时按 id 去重（message_ids 可能被历史逻辑重复 push），并过滤未加载的悬空 id。
    const out = []
    let seen = null
    for (let i = 0; i < sorted.length; i++) {
      const id = sorted[i]
      const msg = store.messages[id]
      if (!msg) continue
      if (seen === null) seen = new Set()
      if (seen.has(id)) continue
      seen.add(id)
      out.push(msg)
    }

    prevIdsRef = ids
    prevIdsLen = ids.length
    prevSortedRef = sorted

    // 3) 内容与上一次完全一致（逐项同一对象）→ 复用旧数组引用，避免整列表重渲染。
    if (out.length === prevOut.length) {
      let same = true
      for (let i = 0; i < out.length; i++) {
        if (out[i] !== prevOut[i]) { same = false; break }
      }
      if (same) return prevOut
    }
    prevOut = out
    return out
  })

  // 长度直接来自上面已算好的结果：保证「渲染条数」与分页判断口径一致
  // （去重/悬空过滤后仍然是同一个数字，不会出现 count 与实际行数不符）。
  const currentMessagesLength = computed(() => currentMessages.value.length)

  return { target, currentMessages, currentMessagesLength }
}
