// 投票（poll / vote）协议解析、合法性校验、直挂票暂存与聚合
import { parseMsgContent } from './format.js'

export const POLL_MAX_OPTS = 10
export const POLL_MAX_OPT_LEN = 40
export const POLL_MAX_Q_LEN = 80
export const POLL_INVALID_TEXT = {
  repeat: '重复投票',
  'single-multi': '单选题多选',
  overflow: '超出限选数',
  expired: '截止后投票',
  'no-custom': '非法自拟选项',
}

/** 归一化「自拟选项」表：{ '<uid>': '文本' } */
export function normalizeCustom(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const uid of Object.keys(raw)) {
    const key = String(uid == null ? '' : uid).trim()
    if (!key) continue
    const text = String(raw[uid] == null ? '' : raw[uid]).trim().slice(0, POLL_MAX_OPT_LEN)
    if (!text) continue
    out[key] = text
  }
  return out
}

/** 归一化点选他人自拟选项的 UID 数组：[authorUid...] */
export function normalizeCustomPick(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const key = String(item == null ? '' : item).trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out.sort(compareIdStr)
}

/** 归一化「他人自拟选项投票」表：{ '<voterUid>': ['<authorUid>', ...] } */
export function normalizeCustomVotes(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const uid of Object.keys(raw)) {
    const key = String(uid == null ? '' : uid).trim()
    if (!key) continue
    const picks = normalizeCustomPick(raw[uid])
    if (!picks.length) continue
    out[key] = picks
  }
  return out
}

function compareIdStr(a, b) {
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  if (sa === sb) return 0
  const na = Number(sa)
  const nb = Number(sb)
  if (sa !== '' && sb !== '' && Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
    return na - nb
  }
  return sa < sb ? -1 : 1
}

/** 比较两条投票消息的先后序（按 (send_time, id) 升序：> 0 表示 A 更新，< 0 表示 A 更旧） */
export function compareVoteOrder(tA, idA, tB, idB) {
  const ta = Number(tA) || 0
  const tb = Number(tB) || 0
  if (ta !== tb) return ta - tb
  return compareIdStr(idA, idB)
}

/** 归一化投票元数据 {'<uid>':{n,t,id,ids}} */
export function normalizeVoteMeta(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const uid of Object.keys(raw)) {
    const key = String(uid == null ? '' : uid).trim()
    if (!key) continue
    const m = raw[uid] || {}
    const ids = Array.isArray(m.ids) ? [...new Set(m.ids.map(String))] : []
    const fallbackId = ids.length
      ? ids.reduce((best, cur) => (compareIdStr(cur, best) > 0 ? cur : best), ids[0])
      : ''
    out[key] = {
      n: Math.max(1, Math.floor(Number(m.n) || 1)),
      t: Number(m.t) > 0 ? Number(m.t) : 0,
      id: m.id != null && String(m.id) !== '' ? String(m.id) : fallbackId,
      ids,
    }
  }
  return out
}

/** 归一化无效票标记：{ '<uid>': <原因码> } */
export function normalizeInvalid(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const uid of Object.keys(raw)) {
    const key = String(uid == null ? '' : uid).trim()
    if (!key) continue
    const reason = String(raw[uid] == null ? '' : raw[uid])
    if (POLL_INVALID_TEXT[reason]) out[key] = reason
  }
  return out
}

/** 判定一次投票是否违规（纯函数） */
export function judgeVote(def, pick, custom, sentAtSec, repeat, customPick) {
  const pickArr = Array.isArray(pick) ? pick : []
  const customPickArr = normalizeCustomPick(customPick)
  const hasCustom = !!String(custom == null ? '' : custom).trim()
  const total = pickArr.length + customPickArr.length + (hasCustom ? 1 : 0)
  if (repeat) return 'repeat'
  if (!def) return null
  if (total === 0) return null
  if (!def.multi && total > 1) return 'single-multi'
  if (def.multi && def.maxSelect > 0 && total > def.maxSelect) return 'overflow'
  if ((hasCustom || customPickArr.length > 0) && !def.allowCustom) return 'no-custom'
  if (def.until && Number(sentAtSec) > 0 && Number(sentAtSec) > def.until) return 'expired'
  return null
}

/** 归一化 votes {'<uid>':[下标]} */
export function normalizeVotes(raw, optCount) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  const n = Number(optCount) || 0
  for (const uid of Object.keys(raw)) {
    const key = String(uid == null ? '' : uid).trim()
    if (!key) continue
    const arr = Array.isArray(raw[uid]) ? raw[uid] : []
    const pick = [...new Set(arr.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n))]
    if (!pick.length) continue
    out[key] = pick.sort((a, b) => a - b)
  }
  return out
}

/** 解析 poll 定义（非 poll 返回 null） */
export function parsePoll(obj) {
  if (!obj || obj.type !== 'poll') return null
  const q = String(obj.content == null ? '' : obj.content).trim().slice(0, POLL_MAX_Q_LEN)
  const rawOpts = Array.isArray(obj.opts) ? obj.opts : []
  const opts = rawOpts
    .map((o) => String(o == null ? '' : o).trim().slice(0, POLL_MAX_OPT_LEN))
    .filter((o) => o.length > 0)
    .slice(0, POLL_MAX_OPTS)
  const allowCustom = !!obj.allowCustom
  if (!q || (opts.length < 2 && !allowCustom)) return null
  const until = Number(obj.until) > 0 ? Number(obj.until) : 0
  const multi = !!obj.multi
  let maxSelect = multi ? Math.floor(Number(obj.maxSelect) || 0) : 0
  if (!Number.isFinite(maxSelect) || maxSelect < 0) maxSelect = 0
  if (!allowCustom && maxSelect > opts.length) maxSelect = opts.length
  return {
    q,
    opts,
    multi,
    until,
    maxSelect,
    allowCustom,
    votes: normalizeVotes(obj.votes, opts.length),
    custom: normalizeCustom(obj.custom),
    customVotes: normalizeCustomVotes(obj.customVotes),
    voteMeta: normalizeVoteMeta(obj.voteMeta),
    invalid: normalizeInvalid(obj.invalid),
  }
}

/** 解析 vote 消息内容；非 vote 返回 null */
export function parseVote(obj) {
  if (!obj || obj.type !== 'vote') return null
  const poll = obj.poll
  if (poll == null || (typeof poll !== 'number' && typeof poll !== 'string')) return null
  const raw = Array.isArray(obj.pick) ? obj.pick : []
  const pick = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0))]
  const custom = String(obj.custom == null ? '' : obj.custom).trim().slice(0, POLL_MAX_OPT_LEN)
  const customPick = normalizeCustomPick(obj.customPick)
  if (!pick.length && !custom && !customPick.length) return null
  const out = { poll: String(poll), pick }
  if (custom) out.custom = custom
  if (customPick.length) out.customPick = customPick
  return out
}

/** 构造 poll 消息内容 */
export function makePollContent({ content, opts, multi, until, votes, maxSelect, allowCustom, custom, customVotes, voteMeta, invalid }) {
  const cleanOpts = (opts || [])
    .map((o) => String(o == null ? '' : o).trim().slice(0, POLL_MAX_OPT_LEN))
    .filter(Boolean)
    .slice(0, POLL_MAX_OPTS)
  const out = {
    type: 'poll',
    content: String(content || '').trim().slice(0, POLL_MAX_Q_LEN),
    opts: cleanOpts,
    multi: !!multi,
    until: Number(until) > 0 ? Number(until) : 0,
  }
  const v = normalizeVotes(votes, cleanOpts.length)
  if (Object.keys(v).length) out.votes = v
  if (out.multi) {
    let ms = Math.floor(Number(maxSelect) || 0)
    if (ms > 0) {
      if (!allowCustom && ms > cleanOpts.length) ms = cleanOpts.length
      out.maxSelect = ms
    }
  }
  if (allowCustom) out.allowCustom = true
  const cu = normalizeCustom(custom)
  if (Object.keys(cu).length) out.custom = cu
  const cv = normalizeCustomVotes(customVotes)
  if (Object.keys(cv).length) out.customVotes = cv
  const vm = normalizeVoteMeta(voteMeta)
  if (Object.keys(vm).length) out.voteMeta = vm
  const iv = normalizeInvalid(invalid)
  if (Object.keys(iv).length) out.invalid = iv
  return JSON.stringify(out)
}

/** 把一条 vote 的票并进 poll 的 votes（纯函数） */
export function mergeVoteIntoPoll(pollContent, pollId, voteObj, sender) {
  const obj = parseMsgContent(pollContent)
  const def = parsePoll(obj)
  if (!def || !voteObj) return null
  if (String(voteObj.poll) !== String(pollId)) return null
  const uid = String(sender == null ? '' : sender).trim()
  if (!uid) return null
  const pick = normalizeVotes({ [uid]: voteObj.pick }, def.opts.length)[uid]
  const custom = String(voteObj.custom == null ? '' : voteObj.custom).trim().slice(0, POLL_MAX_OPT_LEN)
  const customPick = normalizeCustomPick(voteObj.customPick)
  if (!pick && !custom && !customPick.length) return null
  const votes = { ...(obj.votes || {}) }
  const customMap = { ...(obj.custom || {}) }
  const customVotesMap = { ...(obj.customVotes || {}) }
  if (pick) votes[uid] = pick
  else delete votes[uid]
  if (custom) customMap[uid] = custom
  else delete customMap[uid]
  if (customPick.length) customVotesMap[uid] = customPick
  else delete customVotesMap[uid]
  return makePollContent({
    content: def.q,
    opts: def.opts,
    multi: def.multi,
    until: def.until,
    maxSelect: def.maxSelect,
    allowCustom: def.allowCustom,
    votes,
    custom: customMap,
    customVotes: customVotesMap,
    voteMeta: obj.voteMeta,
    invalid: obj.invalid,
  })
}

/** 构造 vote 消息内容 */
export function makeVoteContent(pollMsgId, pick, custom, customPick) {
  const out = {
    type: 'vote',
    poll: String(pollMsgId),
    pick: [...new Set((pick || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0))],
  }
  const c = String(custom == null ? '' : custom).trim().slice(0, POLL_MAX_OPT_LEN)
  if (c) out.custom = c
  const cp = normalizeCustomPick(customPick)
  if (cp.length) out.customPick = cp
  return JSON.stringify(out)
}

// ========== 直挂票表（vote 先于 poll 到达时暂存） ==========
const orphanVotes = new Map()
const orphanExtra = new Map()

function orphanBucket(pollId) {
  const key = String(pollId)
  let b = orphanExtra.get(key)
  if (!b) {
    b = { meta: {}, custom: {}, customVotes: {}, invalid: {} }
    orphanExtra.set(key, b)
  }
  return b
}

export function mergeOrphanVote(pollId, voteObj, sender, msgId, sendTime) {
  const key = String(pollId)
  const uid = String(sender == null ? '' : sender).trim()
  if (!uid) return null
  const pick = normalizeVotes({ [uid]: voteObj && voteObj.pick }, Number.MAX_SAFE_INTEGER)[uid]
  const custom = String((voteObj && voteObj.custom) == null ? '' : voteObj && voteObj.custom).trim().slice(0, POLL_MAX_OPT_LEN)
  const customPick = normalizeCustomPick(voteObj && voteObj.customPick)
  if (!pick && !custom && !customPick.length) return null
  const bucket = orphanBucket(key)
  const meta = bucket.meta[uid] || { n: 0, t: 0, id: '', ids: [] }
  const idStr = msgId == null ? '' : String(msgId)
  if (idStr && meta.ids.indexOf(idStr) !== -1) return orphanVotes.get(key) || {}
  const sentAt = Number(sendTime) > 0 ? Number(sendTime) : 0
  const repeat = meta.n > 0
  const isNewer = !repeat || compareVoteOrder(sentAt, idStr, meta.t, meta.id) > 0
  bucket.meta[uid] = {
    n: meta.n + 1,
    t: isNewer ? (sentAt || meta.t) : meta.t,
    id: isNewer ? (idStr || meta.id) : meta.id,
    ids: idStr ? [...meta.ids, idStr] : meta.ids,
  }
  if (repeat) {
    bucket.invalid[uid] = 'repeat'
  } else if (isNewer) {
    const reason = judgeVote(null, pick || [], custom, sentAt, false, customPick)
    if (reason) bucket.invalid[uid] = reason
  }
  if (isNewer) {
    if (custom) bucket.custom[uid] = custom
    else delete bucket.custom[uid]
    if (customPick.length) bucket.customVotes[uid] = customPick
    else delete bucket.customVotes[uid]
    const prev = orphanVotes.get(key) || {}
    const next = { ...prev }
    if (pick) next[uid] = pick
    else if (custom || customPick.length) next[uid] = []
    orphanVotes.set(key, next)
    return next
  }
  return orphanVotes.get(key) || {}
}

export function getOrphanVotes(pollId) {
  return orphanVotes.get(String(pollId)) || {}
}

export function clearPendingVotes() {
  orphanVotes.clear()
  orphanExtra.clear()
}

/** 取出并清空某 poll 的直挂票，供入库层在 poll 消息到达时合并 */
export function consumeOrphanPoll(pollId, content) {
  const key = String(pollId)
  const orphan = orphanVotes.get(key)
  const bucket = orphanExtra.get(key)
  const hasOrphan = !!(orphan && Object.keys(orphan).length)
  const hasExtra = !!(
    bucket &&
    (Object.keys(bucket.custom).length ||
      Object.keys(bucket.customVotes).length ||
      Object.keys(bucket.invalid).length ||
      Object.keys(bucket.meta).length)
  )
  if (!hasOrphan && !hasExtra) return null
  let mergedContent = content
  const initialObj = parseMsgContent(content)
  const existingMeta = normalizeVoteMeta(initialObj && initialObj.voteMeta)
  const uids = new Set([
    ...Object.keys(orphan || {}),
    ...Object.keys((bucket && bucket.custom) || {}),
    ...Object.keys((bucket && bucket.customVotes) || {}),
    ...Object.keys((bucket && bucket.meta) || {}),
  ])
  const winningMeta = {}
  const repeatedUids = new Set()
  for (const uid of uids) {
    const m = (bucket && bucket.meta && bucket.meta[uid]) || null
    const em = existingMeta[uid] || null
    const mergedIds = [...new Set([...(em ? em.ids : []), ...(m ? m.ids : [])])]
    const totalN = mergedIds.length ? mergedIds.length : (em ? em.n : 0) + (m ? m.n : 0)
    if (totalN > 1) repeatedUids.add(uid)
    const takeOrphan = !em || (m && compareVoteOrder(m.t, m.id, em.t, em.id) > 0)
    if (takeOrphan) {
      const pick = (orphan && orphan[uid]) || []
      const custom = (bucket && bucket.custom && bucket.custom[uid]) || ''
      const customPick = (bucket && bucket.customVotes && bucket.customVotes[uid]) || []
      const merged = mergeVoteIntoPoll(mergedContent, key, { poll: key, pick, custom, customPick }, uid)
      if (merged) mergedContent = merged
      winningMeta[uid] = {
        n: Math.max(1, totalN || 1),
        t: m ? m.t : 0,
        id: m ? m.id : '',
        ids: mergedIds,
      }
    } else {
      winningMeta[uid] = {
        n: Math.max(1, totalN || 1),
        t: em.t,
        id: em.id,
        ids: mergedIds,
      }
    }
  }
  const finalObj = parseMsgContent(mergedContent)
  const defNow = parsePoll(finalObj)
  const vmeta = { ...(finalObj.voteMeta || {}) }
  const invalid = { ...(finalObj.invalid || {}) }
  for (const uid of uids) {
    if (winningMeta[uid]) vmeta[uid] = winningMeta[uid]
    if (repeatedUids.has(uid)) {
      invalid[uid] = 'repeat'
      continue
    }
    const prev = (bucket && bucket.invalid && bucket.invalid[uid]) || null
    if (prev) invalid[uid] = prev
    const r2 = judgeVote(
      defNow,
      (orphan && orphan[uid]) || [],
      (bucket && bucket.custom && bucket.custom[uid]) || '',
      winningMeta[uid] && winningMeta[uid].t,
      false,
      (bucket && bucket.customVotes && bucket.customVotes[uid]) || [],
    )
    if (r2 && r2 !== 'repeat' && !invalid[uid]) invalid[uid] = r2
  }
  if (Object.keys(vmeta).length) finalObj.voteMeta = vmeta
  if (Object.keys(invalid).length) finalObj.invalid = invalid
  orphanVotes.delete(key)
  orphanExtra.delete(key)
  return JSON.stringify(finalObj)
}

/** 聚合投票结果 */
export function aggregatePoll(pollDef, pollId, selfUid) {
  const opts = pollDef?.opts || []
  const counts = new Array(opts.length).fill(0)
  const voters = opts.map(() => [])
  const seen = new Set()
  const myPick = []
  const pid = String(pollId)
  const me = selfUid == null ? null : String(selfUid).trim()

  const orphanBucketForAgg = orphanExtra.get(pid)
  const invalidMap = { ...((pollDef && pollDef.invalid) || {}) }
  if (orphanBucketForAgg) {
    for (const u of Object.keys(orphanBucketForAgg.invalid)) invalidMap[u] = orphanBucketForAgg.invalid[u]
  }
  const isInvalid = (uid) => Object.prototype.hasOwnProperty.call(invalidMap, uid)

  const mark = (uid, i) => {
    if (isInvalid(uid)) return
    const key = uid + ':' + i
    if (seen.has(key)) return
    seen.add(key)
    counts[i]++
    if (voters[i].indexOf(uid) === -1) voters[i].push(uid)
    if (me && uid === me) myPick.push(i)
  }

  const votes = (pollDef && pollDef.votes) || {}
  for (const uid of Object.keys(votes)) {
    for (const i of votes[uid] || []) {
      if (i >= 0 && i < opts.length) mark(String(uid), i)
    }
  }

  const orphan = orphanVotes.get(pid) || {}
  for (const uid of Object.keys(orphan)) {
    for (const i of orphan[uid] || []) {
      if (i >= 0 && i < opts.length) mark(String(uid), i)
    }
  }

  const customMap = { ...((pollDef && pollDef.custom) || {}) }
  if (orphanBucketForAgg) {
    for (const u of Object.keys(orphanBucketForAgg.custom)) customMap[u] = orphanBucketForAgg.custom[u]
  }
  const customVotesMap = { ...((pollDef && pollDef.customVotes) || {}) }
  if (orphanBucketForAgg && orphanBucketForAgg.customVotes) {
    for (const u of Object.keys(orphanBucketForAgg.customVotes)) customVotesMap[u] = orphanBucketForAgg.customVotes[u]
  }

  const extraByAuthor = new Map()
  const authorKeys = Object.keys(customMap)
    .map((u) => String(u).trim())
    .filter(Boolean)
    .sort(compareIdStr)
  for (const authorUid of authorKeys) {
    const text = String(customMap[authorUid] || '').trim()
    if (!text || isInvalid(authorUid)) continue
    const entry = {
      authorUid,
      label: text,
      count: 0,
      voters: [],
      mine: me != null && authorUid === me,
    }
    extraByAuthor.set(authorUid, entry)
    const selfSeenKey = 'cv:' + authorUid + ':' + authorUid
    if (!seen.has(selfSeenKey)) {
      seen.add(selfSeenKey)
      entry.count++
      entry.voters.push(authorUid)
    }
  }

  const myCustomPick = []
  const voterKeys = Object.keys(customVotesMap)
    .map((u) => String(u).trim())
    .filter(Boolean)
    .sort(compareIdStr)
  for (const voterUid of voterKeys) {
    if (isInvalid(voterUid)) continue
    const pickedAuthors = normalizeCustomPick(customVotesMap[voterUid])
    for (const targetAuthorUid of pickedAuthors) {
      const entry = extraByAuthor.get(targetAuthorUid)
      if (!entry) continue
      const seenKey = 'cv:' + voterUid + ':' + targetAuthorUid
      if (seen.has(seenKey)) continue
      seen.add(seenKey)
      entry.count++
      if (entry.voters.indexOf(voterUid) === -1) entry.voters.push(voterUid)
      if (me && voterUid === me && myCustomPick.indexOf(targetAuthorUid) === -1) {
        myCustomPick.push(targetAuthorUid)
      }
    }
  }

  const extraOptions = [...extraByAuthor.values()]
  const myCustom = me != null && customMap[me] && !isInvalid(me) ? String(customMap[me]).trim() : null
  const total = counts.reduce((a, b) => a + b, 0) + extraOptions.reduce((a, o) => a + o.count, 0)
  const expired = !!(pollDef?.until && Date.now() / 1000 > pollDef.until)
  const invalidVoters = Object.keys(invalidMap).map((uid) => ({ uid, reason: invalidMap[uid] }))
  return {
    counts,
    voters,
    total,
    myPick: myPick.sort((a, b) => a - b),
    multi: !!pollDef?.multi,
    expired,
    maxSelect: (pollDef && pollDef.maxSelect) || 0,
    allowCustom: !!(pollDef && pollDef.allowCustom),
    extraOptions,
    invalidVoters,
    myCustom,
    myCustomPick: myCustomPick.sort(compareIdStr),
  }
}

export function pollPlainText(obj) {
  const p = parsePoll(obj)
  if (!p) return ''
  return '【投票】' + p.q + '：' + (p.opts.length ? p.opts.join(' / ') : '（开放题，自拟答案）')
}
