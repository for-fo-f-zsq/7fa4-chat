// ========== 用户数据存储：SQLite（node:sqlite）+ AES-256-GCM 加密 ==========
// 取代旧的单文件 data/<uid>.7c JSON 存储，解决：
//  1. 安全性：敏感内容 AES-256-GCM 加密（密钥随客户端分发属混淆级防护，防明文直读/拖走查看）
//  2. 数据丢失：SQLite 事务 + WAL，写一半崩溃不损坏（原子性）
//  3. 单文件耦合：拆分为 convos（会话元数据）/ messages（消息，按会话索引）/ prefs（草稿/免打扰等）/ kv
//  4. 大文件全量读写：按会话索引 + 渲染层懒加载 + 增量写入
const { DatabaseSync } = require('node:sqlite')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

// 数据密钥版本：升到 v2 后，v1 密文一律解不开 —— 检测到旧版数据即整体作废，交给服务端重新拉取
const DATA_KEY_VER = 2
const DATA_PASSPHRASE = '7fa4-chat::userdata::v2'
/** kv 表中的密钥版本标记；无标记 + 密文解不开 = 旧版数据 */
const KEYVER_MARK = 'data-key-ver'
const SCHEMA = `
CREATE TABLE IF NOT EXISTS convos (
  uid INTEGER NOT NULL,
  kind TEXT NOT NULL,
  cid INTEGER NOT NULL,
  meta TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (uid, kind, cid)
);
CREATE TABLE IF NOT EXISTS messages (
  uid INTEGER NOT NULL,
  kind TEXT NOT NULL,
  cid INTEGER NOT NULL,
  mid INTEGER NOT NULL,
  send_time INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (uid, kind, cid, mid)
);
CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(uid, kind, cid, send_time);
CREATE TABLE IF NOT EXISTS prefs (
  uid INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (uid, key)
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

// ---------- AES-256-GCM ----------
// 密钥只与常量有关：缓存到模块级，避免每次 encryptText/decryptText 重复算一次 SHA-256。
// （saveAll 里每条消息都会调 encryptText，旧实现等于每条记录多一次哈希。）
let _aesKey = null
function aesKey() {
  if (!_aesKey) _aesKey = crypto.createHash('sha256').update(DATA_PASSPHRASE).digest()
  return _aesKey
}

/** 内容指纹：用来判断「这条记录是否真的变了」，避免重复加密 + 重复写盘 */
function fingerprint(text) {
  return crypto.createHash('sha1').update(text).digest('base64')
}

// 记录指纹缓存的上限：超过就整体清空（下次退化为全量写一遍，不会丢数据）
const SEEN_LIMIT = 120000
// saveAll 超过这个耗时才打日志（避免每 10s 一条噪声，卡顿时又能留下证据）
const SLOW_SAVE_MS = 40

function encryptText(plain) {
  const key = aesKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return JSON.stringify({ v: DATA_KEY_VER, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: enc.toString('base64') })
}

function decryptText(payload) {
  const p = JSON.parse(payload)
  if (p.v !== DATA_KEY_VER) throw new Error('数据密钥版本不符（v' + p.v + '）')
  const key = aesKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(p.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(p.data, 'base64')), decipher.final()]).toString('utf8')
}

// 落盘一律用 encryptText(已序列化的 JSON)：写入前要先算内容指纹，避免重复序列化
const decryptJSON = (payload) => JSON.parse(decryptText(payload))

function normalizeFree(val) {
  return val === true || val === 1 || val === '1'
}

function normalizeMessageForSave(m, mid) {
  const rec = { ...m, id: Number(mid), mid: Number(mid) }
  rec.free = normalizeFree(m.token_free ?? m.free)
  return rec
}

function normalizeMessageOnLoad(m) {
  if (!m || typeof m !== 'object') return m
  if (m.free !== undefined || m.token_free !== undefined) {
    m.free = normalizeFree(m.token_free ?? m.free)
  }
  return m
}

/** 库文件（含 WAL/SHM）总字节数，仅用于日志 */
function sizeOf(p) {
  let n = 0
  for (const suffix of ['', '-wal', '-shm']) {
    try { n += fs.statSync(p + suffix).size } catch {}
  }
  return n
}

// ---------- 存储类 ----------
class UserStore {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = null
    // 已落库内容的指纹（内存）：convos/messages/prefs 的 key → sha1(明文 JSON)。
    // 渲染层的 saveAll 是「全量快照」语义（每 10s + 每次收发消息），同一份内容会被反复送来；
    // 这里命中指纹就直接跳过「AES 加密 + SQLite upsert」，把主进程的热路径压到最低。
    this.seen = { convos: new Map(), msgs: new Map(), prefs: new Map() }
  }

  /** 指纹缓存超限就整体重置（只会让下一轮多做一次全量写，不影响正确性） */
  _seenPut(kind, key, sig) {
    const m = this.seen[kind]
    if (m.size >= SEEN_LIMIT) m.clear()
    m.set(key, sig)
  }

  init() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    // 密钥版本升级：旧版（v1）密文一律解不开，检测到就整体作废 —— 数据都由服务端重新拉取
    if (this.detectStale()) {
      const mb = (sizeOf(this.dbPath) / 1048576).toFixed(1)
      this.dropStale()
      console.log(`[Store] 检测到旧版数据（密钥 v1），已作废本地缓存 ${mb}MB，将从服务端重新拉取`)
    }
    this.db = new DatabaseSync(this.dbPath)
    for (const stmt of SCHEMA.split(';')) {
      const s = stmt.trim()
      if (s) {
        try { this.db.exec(s) } catch { /* 已存在等 */ }
      }
    }
    try { this.db.exec('PRAGMA journal_mode=WAL') } catch {}
    // synchronous=NORMAL：WAL 模式下 COMMIT 不再每次 fsync（只写 WAL 文件，由 checkpoint 落主库）。
    // 进程崩溃（含 kill/断电重启前的进程内崩溃）仍保证已提交事务不丢；只有「操作系统崩溃/掉电」
    // 才可能回滚最后几个提交。对聊天缓存这种可从服务端重新拉取的数据，这个取舍完全值得：
    // 旧值 FULL 让每次 saveAll 的 COMMIT 都要等磁盘 fsync，机械盘/杀软实时扫描时主进程会卡住几十 ms。
    try { this.db.exec('PRAGMA synchronous=NORMAL') } catch {}
    try { this.setKV(KEYVER_MARK, String(DATA_KEY_VER)) } catch {}
    return this
  }

  /** 是否残留旧密钥数据：kv 无版本标记，且库里已有密文用当前密钥解不开（空库/新库不算） */
  detectStale() {
    if (!fs.existsSync(this.dbPath)) return false
    let db = null
    try {
      db = new DatabaseSync(this.dbPath)
      const mark = db.prepare('SELECT value FROM kv WHERE key=?').get(KEYVER_MARK)
      if (mark && String(mark.value) === String(DATA_KEY_VER)) return false
      const row = db.prepare('SELECT content AS c FROM messages LIMIT 1').get()
        || db.prepare('SELECT meta AS c FROM convos LIMIT 1').get()
        || db.prepare('SELECT value AS c FROM prefs LIMIT 1').get()
      if (!row) return false
      try { decryptText(row.c); return false } catch { return true }
    } catch {
      return false // 表结构读不出（全新空文件等）→ 不擅自删
    } finally {
      try { db?.close() } catch {}
    }
  }

  /** 作废整个本地库（含 WAL/SHM），下次启动即为全新空库 */
  dropStale() {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(this.dbPath + suffix, { force: true }) } catch {}
    }
  }

  checkpoint() {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  close() {
    if (!this.db) return
    try { this.checkpoint() } catch {}
    try { this.db.close() } catch {}
    this.db = null
  }

  // ---------- 会话元数据 ----------
  /** convos: [{kind:'user'|'group', cid, meta(obj)}]（事务批量 upsert） */
  saveConvos(uid, convos) {
    if (!this.db || !convos || !convos.length) return { success: true, count: 0 }
    let rows
    try { rows = this._planConvos(uid, convos) } catch (e) { return { success: false, error: e.message } }
    const r = this._writeRows(uid, { convoRows: rows })
    if (!r.success) return r
    return { success: true, count: convos.length, writes: r.writes }
  }

  loadConvos(uid) {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const rows = this.db.prepare('SELECT kind, cid, meta FROM convos WHERE uid=?').all(uid)
      const users = {}
      const groups = {}
      for (const r of rows) {
        try {
          const meta = decryptJSON(r.meta)
          if (r.kind === 'group') groups[r.cid] = meta
          else users[r.cid] = meta
        } catch { /* 解密失败跳过该会话 */ }
      }
      return { success: true, users, groups }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ---------- 消息 ----------
  /** msgs: [{mid|id, send_time, ...}]，逐条加密，事务批量写 */
  saveMessages(uid, kind, cid, msgs) {
    if (!this.db || !msgs || !msgs.length) return { success: true, count: 0 }
    let rows
    try { rows = this._planMessages(uid, { [kind + ':' + cid]: msgs }) } catch (e) { return { success: false, error: e.message } }
    const r = this._writeRows(uid, { msgRows: rows })
    if (!r.success) return r
    return { success: true, count: msgs.length, writes: r.writes }
  }

  // ---------- 增量写入的公共实现 ----------
  /**
   * 把渲染层送来的快照拆成「真正需要写库的行」：
   * - 空数组 / 未变化的记录直接跳过（不做 AES、不做 SQLite 语句）；
   * - 消息以 mid 为粒度判重，所以渲染层即使重发整会话 1000 条，也只有新消息/被编辑的消息会落盘。
   */
  _planConvos(uid, convos) {
    const out = []
    if (!Array.isArray(convos)) return out
    for (const c of convos) {
      if (!c || c.cid == null) continue
      const kind = c.kind === 'group' ? 'group' : (c.kind === 'user' ? 'user' : null)
      if (!kind) continue
      const cid = Number(c.cid)
      if (!Number.isFinite(cid)) continue
      const json = JSON.stringify(c.meta)
      const key = uid + '|' + kind + ':' + cid
      const sig = fingerprint(json)
      if (this.seen.convos.get(key) === sig) continue
      out.push({ kind, cid, json, key, sig })
    }
    return out
  }

  /** messages: {'user:cid'|'group:cid': [msgs]} → 待写消息行 */
  _planMessages(uid, messages) {
    const out = []
    if (!messages || typeof messages !== 'object') return out
    for (const [convoKey, msgs] of Object.entries(messages)) {
      if (!Array.isArray(msgs) || !msgs.length) continue
      const sep = convoKey.indexOf(':')
      if (sep <= 0) continue
      const kind = convoKey.slice(0, sep)
      const cid = Number(convoKey.slice(sep + 1))
      if (kind !== 'user' && kind !== 'group') continue
      if (!Number.isFinite(cid)) continue
      for (const m of msgs) {
        if (m == null) continue
        const mid = m.mid ?? m.id
        if (mid == null || !Number.isFinite(Number(mid))) continue
        // 统一 id/mid 字段：渲染层传 {id,..}，迁移/备份传 {mid,..}
        const json = JSON.stringify(normalizeMessageForSave(m, Number(mid)))
        const key = uid + '|' + kind + ':' + cid + ':' + Number(mid)
        const sig = fingerprint(json)
        if (this.seen.msgs.get(key) === sig) continue
        out.push({ kind, cid, mid: Number(mid), sendTime: Number(m.send_time || 0), json, key, sig })
      }
    }
    return out
  }

  _planPrefs(uid, prefs) {
    const out = []
    if (!prefs || typeof prefs !== 'object') return out
    for (const [key, value] of Object.entries(prefs)) {
      if (value === undefined) continue
      const json = JSON.stringify(value)
      const sig = fingerprint(json)
      if (this.seen.prefs.get(uid + '|' + key) === sig) continue
      out.push({ key, json, sig })
    }
    return out
  }

  /** 单事务写入已规划好的行；成功后才登记指纹（回滚时指纹不变，下一轮会重写） */
  _writeRows(uid, { convoRows = [], msgRows = [], prefRows = [] } = {}) {
    const total = convoRows.length + msgRows.length + prefRows.length
    if (!total) return { success: true, writes: 0, skipped: true }
    try {
      this.db.exec('BEGIN')
      if (convoRows.length) {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO convos (uid, kind, cid, meta, updated) VALUES (?,?,?,?,?)')
        const now = Date.now()
        for (const r of convoRows) stmt.run(uid, r.kind, r.cid, encryptText(r.json), now)
      }
      if (msgRows.length) {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO messages (uid, kind, cid, mid, send_time, content) VALUES (?,?,?,?,?,?)')
        for (const r of msgRows) stmt.run(uid, r.kind, r.cid, r.mid, r.sendTime, encryptText(r.json))
      }
      if (prefRows.length) {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO prefs (uid, key, value) VALUES (?,?,?)')
        for (const r of prefRows) stmt.run(uid, r.key, encryptText(r.json))
      }
      this.db.exec('COMMIT')
      for (const r of convoRows) this._seenPut('convos', r.key, r.sig)
      for (const r of msgRows) this._seenPut('msgs', r.key, r.sig)
      for (const r of prefRows) this._seenPut('prefs', uid + '|' + r.key, r.sig)
      return { success: true, writes: total }
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch {}
      return { success: false, error: e.message }
    }
  }

  // ---------- 全量快照（唯一保存通道） ----------
  /**
   * 一次性原子保存全部数据：会话元数据 + 偏好 + 待写消息（按会话）。
   * 单一事务：要么全部落库、要么全部失败，杜绝"会话 id 已存、消息内容未存"的分裂状态。
   * messages 传 { 'user:cid'|'group:cid': [msgs] }，仅包含有变化的会话（脏区）；
   * 即使渲染层把整会话的消息都送来，这里也会按 mid + 内容指纹只写真正变化的那些条。
   * 消息按 mid 增量合并（INSERT OR REPLACE，不做会话级 DELETE）：
   * 渲染层内存仅为懒加载的部分历史时，也绝不会把库中已保存的完整历史覆盖清空。
   *
   * 返回值：{ success, writes, skipped?, ms }。writes=0 / skipped=true 表示「内容与库里一致，什么都没写」，
   * 此时不会 BEGIN/COMMIT（渲染层 10s 定时保存的绝大多数轮次走这条路）。
   */
  saveAll(uid, { convos, prefs, messages } = {}) {
    if (!this.db) return { success: false, error: 'db not ready' }
    const t0 = Date.now()
    let convoRows, msgRows, prefRows
    // 规划阶段会 JSON.stringify（脏数据如 BigInt 会抛）：这里必须兜住，否则 async IPC 会变成 rejected Promise
    try {
      convoRows = this._planConvos(uid, convos)
      msgRows = this._planMessages(uid, messages)
      prefRows = this._planPrefs(uid, prefs)
    } catch (e) {
      return { success: false, error: e.message }
    }
    const r = this._writeRows(uid, { convoRows, msgRows, prefRows })
    const ms = Date.now() - t0
    if (!r.success) return r
    if (ms >= SLOW_SAVE_MS) {
      console.warn(`[Store] saveAll 偏慢 ${ms}ms（写 ${r.writes} 条：convos ${convoRows.length} / messages ${msgRows.length} / prefs ${prefRows.length}）`)
    }
    return { ...r, ms }
  }

  /** 加载某会话消息（send_time 降序，limit 条；before 为时间游标用于翻页） */
  loadMessages(uid, kind, cid, limit = 500, before = null) {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const rows = before
        ? this.db.prepare('SELECT content FROM messages WHERE uid=? AND kind=? AND cid=? AND send_time < ? ORDER BY send_time DESC LIMIT ?').all(uid, kind, cid, Number(before), Number(limit))
        : this.db.prepare('SELECT content FROM messages WHERE uid=? AND kind=? AND cid=? ORDER BY send_time DESC LIMIT ?').all(uid, kind, cid, Number(limit))
      const out = []
      for (const r of rows) {
        try { out.push(normalizeMessageOnLoad(decryptJSON(r.content))) } catch { /* 单条损坏跳过 */ }
      }
      return { success: true, data: out }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  /** 加载每个会话的最新一条消息（会话列表预览 + 排序用） */
  loadLastMessages(uid) {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const rows = this.db.prepare(
        'SELECT kind, cid, content FROM messages m WHERE uid=? AND mid = (SELECT MAX(mid) FROM messages WHERE uid=? AND kind = m.kind AND cid = m.cid)'
      ).all(uid, uid)
      const data = []
      for (const r of rows) {
        try { data.push({ kind: r.kind, cid: r.cid, msg: normalizeMessageOnLoad(decryptJSON(r.content)) }) } catch {}
      }
      return { success: true, data }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  /** 清理：每个会话只保留最近 keepPerConvo 条消息（服务器可重新拉取） */
  cleanMessages(uid, keepPerConvo = 2000) {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const rows = this.db.prepare(
        'SELECT kind, cid, COUNT(*) AS c FROM messages WHERE uid=? GROUP BY kind, cid HAVING c > ?'
      ).all(uid, Number(keepPerConvo))
      let removed = 0
      if (rows.length) {
        this.db.exec('BEGIN')
        const del = this.db.prepare(
          'DELETE FROM messages WHERE uid=? AND kind=? AND cid=? AND mid IN (SELECT mid FROM messages WHERE uid=? AND kind=? AND cid=? ORDER BY send_time ASC LIMIT ?)'
        )
        for (const r of rows) {
          const excess = r.c - Number(keepPerConvo)
          const info = del.run(uid, r.kind, r.cid, uid, r.kind, r.cid, excess)
          removed += Number(info.changes)
        }
        this.db.exec('COMMIT')
        // 有行被删掉：消息指纹整体作废（数量很小，代价可忽略）
        this.seen.msgs.clear()
      }
      return { success: true, removed }
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch {}
      return { success: false, error: e.message }
    }
  }

  // ---------- 偏好（草稿/免打扰/隐藏/已删/表情） ----------
  /** entries: {key: value(obj)}，事务批量 upsert */
  savePrefs(uid, entries) {
    if (!this.db || !entries) return { success: true }
    let rows
    try { rows = this._planPrefs(uid, entries) } catch (e) { return { success: false, error: e.message } }
    const r = this._writeRows(uid, { prefRows: rows })
    return r.success ? { success: true, writes: r.writes } : r
  }

  loadPrefs(uid) {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const rows = this.db.prepare('SELECT key, value FROM prefs WHERE uid=?').all(uid)
      const out = {}
      for (const r of rows) {
        try { out[r.key] = decryptJSON(r.value) } catch { /* 跳过损坏项 */ }
      }
      return { success: true, data: out }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ---------- 全局 kv ----------
  setKV(key, value) {
    try {
      this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?,?)').run(key, String(value))
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  }

  getKV(key) {
    try {
      const r = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key)
      return { success: true, data: r ? r.value : null }
    } catch (e) { return { success: false, error: e.message } }
  }
  /** 全量导出（备份）：所有会话元数据 + 全部消息（解密）+ 偏好 */
  exportAll(uid) {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const convos = this.loadConvos(uid)
      const prefs = this.loadPrefs(uid)
      const messages = {}
      const rows = this.db.prepare('SELECT content FROM messages WHERE uid=?').all(uid)
      for (const r of rows) {
        try {
          const m = normalizeMessageOnLoad(decryptJSON(r.content))
          if (m && m.id != null) messages[m.id] = m
        } catch { /* 跳过损坏消息 */ }
      }
      return { success: true, users: convos.users, groups: convos.groups, messages, prefs: prefs.data }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  /** 清空全部消息表（缓存管理「清理缓存」，保留会话元数据与偏好） */
  clearAllMessages() {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const r = this.db.prepare('DELETE FROM messages').run()
      this.seen.msgs.clear()
      return { success: true, removed: Number(r.changes) }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  /** 清空某用户的全部消息缓存（保留会话元数据与偏好） */
  cleanAllMessages(uid) {
    if (!this.db) return { success: false, error: 'db not ready' }
    try {
      const r = this.db.prepare('DELETE FROM messages WHERE uid=?').run(uid)
      // 该用户的消息指纹作废（按 uid 前缀清理，其他登录用户不受影响）
      this.seen.msgs.clear()
      return { success: true, removed: Number(r.changes) }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }
}

/**
 * 把旧版数据对象（备份 JSON / 旧 data/<uid>.7c 内容）写入 SQLite。
 * 供旧文件迁移与「恢复聊天数据」共用；消息按 message_ids 归属会话，批量事务入库。
 */
function importLegacyData(store, uid, data) {
  try {
    if (!data || typeof data !== 'object') return { success: false, error: '数据格式异常' }
    // v1 格式：{ users, groups, messages, prefs(系统数据聚合), setting(由渲染层恢复，不入库) }
    // 建 mid → 会话 映射（一次遍历所有 message_ids）
    const convoMap = new Map()
    if (data.users && typeof data.users === 'object') {
      for (const u of Object.values(data.users)) {
        if (Array.isArray(u.message_ids)) {
          for (const mid of u.message_ids) convoMap.set(Number(mid), { kind: 'user', cid: Number(u.uid ?? u.id) })
        }
      }
    }
    if (data.groups && typeof data.groups === 'object') {
      for (const g of Object.values(data.groups)) {
        if (Array.isArray(g.message_ids)) {
          for (const mid of g.message_ids) convoMap.set(Number(mid), { kind: 'group', cid: Number(g.gid ?? g.id) })
        }
      }
    }

    // 会话元数据
    const convos = []
    if (data.users && typeof data.users === 'object') {
      for (const u of Object.values(data.users)) convos.push({ kind: 'user', cid: Number(u.uid ?? u.id), meta: u })
    }
    if (data.groups && typeof data.groups === 'object') {
      for (const g of Object.values(data.groups)) convos.push({ kind: 'group', cid: Number(g.gid ?? g.id), meta: g })
    }
    if (convos.length) store.saveConvos(uid, convos)

    // 消息按会话分组批量入库
    let totalMsgs = 0
    if (data.messages && typeof data.messages === 'object') {
      const byConvo = new Map()
      for (const m of Object.values(data.messages)) {
        if (!m || m.id == null) continue
        const loc = convoMap.get(Number(m.id))
        if (!loc) continue
        const k = loc.kind + ':' + loc.cid
        if (!byConvo.has(k)) byConvo.set(k, [])
        byConvo.get(k).push({ ...m, mid: m.id })
      }
      for (const [k, msgs] of byConvo) {
        const [kind, cid] = k.split(':')
        for (let i = 0; i < msgs.length; i += 500) {
          const r = store.saveMessages(uid, kind, Number(cid), msgs.slice(i, i + 500))
          if (r.success) totalMsgs += r.count
        }
      }
    }

    // 偏好（v1：prefs 聚合全量写入；setting 不入 prefs，由渲染层恢复）
    const prefs = (data.prefs && typeof data.prefs === 'object') ? data.prefs : {}
    store.savePrefs(uid, prefs)
    return { success: true, messages: totalMsgs }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ---------- 旧版单文件迁移（data/<uid>.7c → SQLite，幂等） ----------
function migrateLegacy(store, legacyPath, uid) {
  try {
    if (!fs.existsSync(legacyPath)) return { success: true, migrated: false }
    const raw = fs.readFileSync(legacyPath, 'utf8')
    const data = JSON.parse(raw)
    const r = importLegacyData(store, uid, data)
    if (!r.success) return r
    // 迁移成功 → 旧文件改名保留备份
    fs.renameSync(legacyPath, legacyPath + '.migrated')
    return { success: true, migrated: true, messages: r.messages }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = { UserStore, migrateLegacy, importLegacyData, encryptText, decryptText, normalizeFree }
