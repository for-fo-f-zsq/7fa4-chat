// 网络请求封装、登录接口、消息入库与持久化脏区标记
import { store } from '../store.js'
import { parseMsgContent } from './format.js'
import { MAX_MSG_LENGTH, compressBase64Image } from './media.js'
import {
  consumeOrphanPoll,
  judgeVote,
  mergeOrphanVote,
  mergeVoteIntoPoll,
  parsePoll,
  parseVote,
} from './poll.js'

export async function safeFetch(url, options = {}, timeout = 10000) {
  try {
    let res
    if (timeout > 0) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeout)
      try {
        res = await fetch(url, { ...options, signal: ctrl.signal })
      } finally {
        clearTimeout(timer)
      }
    } else {
      res = await fetch(url, options)
    }
    const _ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (_ctype.includes('text/html')) {
      store.netError = true
      return { json: async () => ({ success: false, _html: true, err: { message: '未连接，正在重新连接…' } }) }
    }
    if (!res.ok) {
      if (_ctype.includes('application/json')) {
        try {
          const errData = await res.json()
          if (errData && typeof errData === 'object') {
            return {
              json: async () => ({
                success: false,
                _status: res.status,
                ...errData,
                err: errData.err || { message: errData.message || res.statusText || `请求失败 (${res.status})` },
              }),
            }
          }
        } catch {}
      }
      return { json: async () => ({ success: false, _status: res.status, err: { message: res.statusText || `请求失败 (${res.status})` } }) }
    }
    try {
      const data = await res.json()
      store.netError = false
      store.online = navigator.onLine
      return { json: async () => data }
    } catch {
      store.netError = true
      return { json: async () => ({ success: false, _html: true, err: { message: '未连接，正在重新连接…' } }) }
    }
  } catch (e) {
    store.netError = true
    return { json: async () => ({ success: false, _netError: true, err: { message: e.message || '网络错误' } }) }
  }
}

export async function tryLogin(user, pwd) {
  const res = await safeFetch(
    '/api/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: user, password: pwd }),
      credentials: 'include',
    },
    10000,
  )
  const data = await res.json()
  if (data && data.error_code !== undefined) return data
  if (data && data._netError) {
    return { error_code: -2, message: '无法连接服务器，请检查网络或在顶部切换服务器线路' }
  }
  if (data && !data._html && (data.message || data.err?.message)) {
    return { error_code: -3, message: data.message || data.err.message }
  }
  return { error_code: -1 }
}

// ===== 消息持久化脏区（唯一保存通道的增量标记） =====
const dirtyMsgKeys = new Set()
// 记录本端主动发送产生的新消息 ID，仅用于识别“刚发出一条消息需要滚到底部”，避免历史补拉误触回底
const ownSentMsgIds = new Set()

export function markOwnSentMsg(id) {
  if (id == null) return
  ownSentMsgIds.add(id)
  if (ownSentMsgIds.size > 200) {
    const oldest = ownSentMsgIds.values().next().value
    if (oldest !== undefined) ownSentMsgIds.delete(oldest)
  }
}

export function consumeOwnSentMsg(id) {
  if (id == null || !ownSentMsgIds.has(id)) return false
  ownSentMsgIds.delete(id)
  return true
}

export function markMsgDirty(kind, cid) {
  dirtyMsgKeys.add(`${kind}:${cid}`)
}

export function peekDirtyMsgKeys() {
  if (!dirtyMsgKeys.size) return null
  return [...dirtyMsgKeys]
}

export function clearDirtyMsgKeys(keys) {
  if (!keys) return
  for (const k of keys) dirtyMsgKeys.delete(k)
}

export function clearAllDirtyMsgKeys() {
  dirtyMsgKeys.clear()
}

/** 消息入库闸门（唯一入口） */
export function ingestMessage(target, c) {
  if (!target || !c || c.id == null) return { kind: 'skip', id: c && c.id }
  const obj = parseMsgContent(c.content)
  const vote = parseVote(obj)
  if (vote) {
    const pollMid = vote.poll
    const pollMsg = store.messages[pollMid]
    const uid = String(c.sender_id == null ? '' : c.sender_id).trim()
    const sentAt = Number(c.send_time) || 0
    const msgId = String(c.id)
    if (pollMsg) {
      const def = parsePoll(parseMsgContent(pollMsg.content))
      const prevMeta = (def && def.voteMeta && def.voteMeta[uid]) || null
      if (prevMeta && prevMeta.ids.indexOf(msgId) !== -1) return { kind: 'vote', id: c.id, pollId: pollMid }
      const hadVote = !!(
        def &&
        ((def.votes && Object.prototype.hasOwnProperty.call(def.votes, uid)) ||
          (def.custom && Object.prototype.hasOwnProperty.call(def.custom, uid)))
      )
      const repeat = prevMeta ? prevMeta.n > 0 : hadVote
      const reason = judgeVote(def, vote.pick, vote.custom, sentAt, repeat)
      const merged = mergeVoteIntoPoll(pollMsg.content, pollMid, vote, c.sender_id)
      if (merged) {
        const mobj = parseMsgContent(merged)
        const vmeta = { ...(mobj.voteMeta || {}) }
        const m0 = vmeta[uid] || { n: 0, t: 0, ids: [] }
        vmeta[uid] = { n: m0.n + 1, t: sentAt > 0 ? sentAt : m0.t, ids: [...m0.ids, msgId] }
        mobj.voteMeta = vmeta
        if (reason) mobj.invalid = { ...(mobj.invalid || {}), [uid]: reason }
        store.messages[pollMid] = { ...pollMsg, content: JSON.stringify(mobj) }
        delete store.messages[c.id]
      }
    } else {
      mergeOrphanVote(pollMid, vote, c.sender_id, c.id, sentAt)
    }
    return { kind: 'vote', id: c.id, pollId: pollMid }
  }
  store.messages[c.id] = { id: c.id, sender: c.sender_id, send_time: c.send_time, content: c.content }
  if (Array.isArray(target.message_ids) && target.message_ids.indexOf(c.id) === -1) {
    target.message_ids.push(c.id)
  }
  if (parsePoll(obj)) {
    const mergedContent = consumeOrphanPoll(String(c.id), store.messages[c.id].content)
    if (mergedContent) {
      store.messages[c.id] = { ...store.messages[c.id], content: mergedContent }
    }
  }
  return { kind: 'msg', id: c.id }
}

export function applyChatToStore(r, pageType, pageId) {
  const c = r.chat
  const target =
    pageType === 'user'
      ? store.users[pageId]
      : pageType === 'group'
        ? store.groups[pageId]
        : store.users[pageId] || store.groups[pageId]
  if (target) {
    ingestMessage(target, c)
    markOwnSentMsg(c && c.id)
    markMsgDirty(pageType === 'group' ? 'group' : 'user', Number(pageId))
  }
  return { tokenInfo: { remain: r.remain_token_count, total: r.remain_token_count + r.used_token_count } }
}

export async function sendChatMessage({ type, targetId, msgObj }) {
  let content = JSON.stringify(msgObj)
  if (
    content.length > MAX_MSG_LENGTH &&
    msgObj.type === 'file' &&
    msgObj.data &&
    String(msgObj.mime || '').startsWith('image/')
  ) {
    const overhead = content.length - msgObj.data.length
    const shrunk = await compressBase64Image(msgObj.data, msgObj.mime, {
      maxB64: Math.max(1024, MAX_MSG_LENGTH - overhead - 16),
    })
    if (shrunk?.data && shrunk.data.length < msgObj.data.length) {
      msgObj = { ...msgObj, data: shrunk.data, size: shrunk.size }
      content = JSON.stringify(msgObj)
    }
  }
  if (content.length > MAX_MSG_LENGTH) {
    if (msgObj.type === 'text') {
      return { success: false, err: { message: `消息过长（${content.length}/${MAX_MSG_LENGTH} 字符），请删减后重发` } }
    }
    if (msgObj.type === 'file' && String(msgObj.mime || '').startsWith('image/')) {
      return { success: false, err: { message: '图片压缩后仍超过发言长度限制，请换一张更小的图片。' } }
    }
    return { success: false, err: { message: `消息过长 (${content.length}/${MAX_MSG_LENGTH})` } }
  }
  return await (
    await safeFetch(
      '/chat/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, target_id: targetId, content }),
      },
      60000,
    )
  ).json()
}
