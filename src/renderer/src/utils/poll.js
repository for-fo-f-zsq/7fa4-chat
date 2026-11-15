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

/** 归一化投票元数据 {'<uid>':{n,t,ids}} */
export function normalizeVoteMeta(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const uid of Object.keys(raw)) {
    const key = String(uid == null ? '' : uid).trim()
    if (!key) continue
    const m = raw[uid] || {}
    const ids = Array.isArray(m.ids) ? [...new Set(m.ids.map(String))] : []
    out[key] = {
      n: Math.max(1, Math.floor(Number(m.n) || 1)),
      t: Number(m.t) > 0 ? Number(m.t) : 0,
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
export function judgeVote(def, pick, custom, sentAtSec, repeat) {
  const pickArr = Array.isArray(pick) ? pick : []
  const hasCustom = !!String(custom == null ? '' : custom).trim()
  const total = pickArr.length + (hasCustom ? 1 : 0)
  if (repeat) return 'repeat'
  if (!def) return null
  if (!hasCustom && total === 0) return null
  if (!def.multi && total > 1) return 'single-multi'
  if (def.multi && def.maxSelect > 0 && total > def.maxSelect) return 'overflow'
  if (hasCustom && !def.allowCustom) return 'no-custom'
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
  if (maxSelect > opts.length) maxSelect = opts.length
  return {
    q,
    opts,
    multi,
    until,
    maxSelect,
    allowCustom,
    votes: normalizeVotes(obj.votes, opts.length),
    custom: normalizeCustom(obj.custom),
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
  if (!pick.length && !custom) return null
  const out = { poll: String(poll), pick }
  if (custom) out.custom = custom
  return out
}

/** 构造 poll 消息内容 */
export function makePollContent({ content, opts, multi, until, votes, maxSelect, allowCustom, custom, voteMeta, invalid }) {
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
      if (ms > cleanOpts.length) ms = cleanOpts.length
      out.maxSelect = ms
    }
  }
  if (allowCustom) out.allowCustom = true
  const cu = normalizeCustom(custom)
  if (Object.keys(cu).length) out.custom = cu
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
  if (!pick && !custom) return null
  const votes = { ...(obj.votes || {}) }
  const customMap = { ...(obj.custom || {}) }
  if (pick) votes[uid] = pick
  else delete votes[uid]
  if (custom) customMap[uid] = custom
  else delete customMap[uid]
  return makePollContent({
    content: def.q,
    opts: def.opts,
    multi: def.multi,
    until: def.until,
    maxSelect: def.maxSelect,
    allowCustom: def.allowCustom,
    votes,
    custom: customMap,
    voteMeta: obj.voteMeta,
    invalid: obj.invalid,
  })
}

/** 构造 vote 消息内容 */
export function makeVoteContent(pollMsgId, pick, custom) {
  const out = {
    type: 'vote',
    poll: String(pollMsgId),
    pick: [...new Set((pick || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0))],
  }
  const c = String(custom == null ? '' : custom).trim().slice(0, POLL_MAX_OPT_LEN)
  if (c) out.custom = c
  return JSON.stringify(out)
}

// ========== 直挂票表（vote 先于 poll 到达时暂存） ==========
const orphanVotes = new Map()
const orphanExtra = new Map()

function orphanBucket(pollId) {
  const key = String(pollId)
  let b = orphanExtra.get(key)
  if (!b) {
    b = { meta: {}, custom: {}, invalid: {} }
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
  if (!pick && !custom) return null
  const bucket = orphanBucket(key)
  const meta = bucket.meta[uid] || { n: 0, t: 0, ids: [] }
  const idStr = msgId == null ? '' : String(msgId)
  if (idStr && meta.ids.indexOf(idStr) !== -1) return orphanVotes.get(key) || {}
  const repeat = meta.n > 0
  const reason = judgeVote(null, pick || [], custom, sendTime, repeat)
  bucket.meta[uid] = {
    n: meta.n + 1,
    t: Number(sendTime) > 0 ? Number(sendTime) : meta.t,
    ids: idStr ? [...meta.ids, idStr] : meta.ids,
  }
  if (reason) bucket.invalid[uid] = reason
  if (custom) bucket.custom[uid] = custom
  else delete bucket.custom[uid]
  const prev = orphanVotes.get(key) || {}
  const next = { ...prev }
  if (pick) next[uid] = pick
  else if (custom) next[uid] = []
  orphanVotes.set(key, next)
  return next
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
    (Object.keys(bucket.custom).length || Object.keys(bucket.invalid).length || Object.keys(bucket.meta).length)
  )
  if (!hasOrphan && !hasExtra) return null
  let mergedContent = content
  const uids = new Set([
    ...Object.keys(orphan || {}),
    ...Object.keys((bucket && bucket.custom) || {}),
    ...Object.keys((bucket && bucket.meta) || {}),
  ])
  for (const uid of uids) {
    const pick = (orphan && orphan[uid]) || []
    const custom = (bucket && bucket.custom && bucket.custom[uid]) || ''
    const merged = mergeVoteIntoPoll(mergedContent, key, { poll: key, pick, custom }, uid)
    if (merged) mergedContent = merged
  }
  const finalObj = parseMsgContent(mergedContent)
  const defNow = parsePoll(finalObj)
  const vmeta = { ...(finalObj.voteMeta || {}) }
  const invalid = { ...(finalObj.invalid || {}) }
  for (const uid of uids) {
    const m = (bucket && bucket.meta && bucket.meta[uid]) || null
    if (m) vmeta[uid] = m
    const prev = (bucket && bucket.invalid && bucket.invalid[uid]) || null
    if (prev) invalid[uid] = prev
    const r2 = judgeVote(
      defNow,
      (orphan && orphan[uid]) || [],
      (bucket && bucket.custom && bucket.custom[uid]) || '',
      m && m.t,
      false,
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
  const me = selfUid == null ? null : String(selfUid)

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
  const extraOptions = []
  const extraIndex = new Map()
  for (const uid of Object.keys(customMap)) {
    const key = String(uid)
    const text = String(customMap[uid] || '').trim()
    if (!text || isInvalid(key)) continue
    const seenKey = 'c:' + key + ':' + text
    if (seen.has(seenKey)) continue
    seen.add(seenKey)
    let idx = extraIndex.get(text)
    if (idx == null) {
      idx = extraOptions.length
      extraIndex.set(text, idx)
      extraOptions.push({ label: text, count: 0, voters: [] })
    }
    extraOptions[idx].count++
    if (extraOptions[idx].voters.indexOf(key) === -1) extraOptions[idx].voters.push(key)
  }

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
  }
}

export function pollPlainText(obj) {
  const p = parsePoll(obj)
  if (!p) return ''
  return '【投票】' + p.q + '：' + (p.opts.length ? p.opts.join(' / ') : '（开放题，自拟答案）')
}
