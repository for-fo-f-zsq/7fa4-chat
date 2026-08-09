// ========== 用户数据存储：SQLite（node:sqlite）+ AES-256-GCM 加密 ==========
// 取代旧的单文件 data/<uid>.7c JSON 存储，解决：
//  1. 安全性：敏感内容 AES-256-GCM 加密（密钥随客户端分发属混淆级防护，防明文直读/拖走查看）
//  2. 数据丢失：SQLite 事务 + WAL，写一半崩溃不损坏（原子性）
//  3. 单文件耦合：拆分为 convos（会话元数据）/ messages（消息，按会话索引）/ prefs（收藏草稿等）/ kv
//  4. 大文件全量读写：按会话索引 + 渲染层懒加载 + 增量写入
const { DatabaseSync } = require('node:sqlite')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const DATA_PASSPHRASE = '7fa4-chat::userdata::v1'
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
function aesKey() {
  return crypto.createHash('sha256').update(DATA_PASSPHRASE).digest()
}

function encryptText(plain) {
  const key = aesKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: enc.toString('base64') })
}

function decryptText(payload) {
  const p = JSON.parse(payload)
  if (p.v !== 1) throw new Error('未知数据版本')
  const key = aesKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(p.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(p.data, 'base64')), decipher.final()]).toString('utf8')
}

const encryptJSON = (obj) => encryptText(JSON.stringify(obj))
const decryptJSON = (payload) => JSON.parse(decryptText(payload))

// ---------- 存储类 ----------
class UserStore {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = null
  }

  init() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    this.db = new DatabaseSync(this.dbPath)
    for (const stmt of SCHEMA.split(';')) {
      const s = stmt.trim()
      if (s) {
        try { this.db.exec(s) } catch { /* 已存在等 */ }
      }
    }
    try { this.db.exec('PRAGMA journal_mode=WAL') } catch {}
    try { this.db.exec('PRAGMA synchronous=NORMAL') } catch {}
    return this
  }

  close() {
    try { this.db?.close() } catch {}
    this.db = null
  }

  // ---------- 会话元数据 ----------
  /** convos: [{kind:'user'|'group', cid, meta(obj)}]（事务批量 upsert） */
  saveConvos(uid, convos) {
    if (!this.db || !convos || !convos.length) return { success: true, count: 0 }
    try {
      this.db.exec('BEGIN')
      const stmt = this.db.prepare('INSERT OR REPLACE INTO convos (uid, kind, cid, meta, updated) VALUES (?,?,?,?,?)')
      const now = Date.now()
      for (const c of convos) stmt.run(uid, c.kind, c.cid, encryptJSON(c.meta), now)
      this.db.exec('COMMIT')
      return { success: true, count: convos.length }
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch {}
      return { success: false, error: e.message }
    }
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
  /** msgs: [{mid, send_time, ...}]，逐条加密，事务批量写 */
  saveMessages(uid, kind, cid, msgs) {
    if (!this.db || !msgs || !msgs.length) return { success: true, count: 0 }
    try {
      this.db.exec('BEGIN')
      const stmt = this.db.prepare('INSERT OR REPLACE INTO messages (uid, kind, cid, mid, send_time, content) VALUES (?,?,?,?,?,?)')
      for (const m of msgs) {
        if (m == null) continue
        const mid = m.mid ?? m.id
        if (mid == null) continue
        // 统一 id/mid 字段：渲染层传 {id,..}，迁移/备份传 {mid,..}
        const rec = { ...m, id: Number(mid), mid: Number(mid) }
        stmt.run(uid, kind, cid, Number(mid), Number(m.send_time || 0), encryptJSON(rec))
      }
      this.db.exec('COMMIT')
      return { success: true, count: msgs.length }
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch {}
      return { success: false, error: e.message }
    }
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
        try { out.push(decryptJSON(r.content)) } catch { /* 单条损坏跳过 */ }
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
        try { data.push({ kind: r.kind, cid: r.cid, msg: decryptJSON(r.content) }) } catch {}
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
      }
      return { success: true, removed }
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch {}
      return { success: false, error: e.message }
    }
  }

  // ---------- 偏好（收藏/草稿/免打扰/隐藏/已删/表情） ----------
  /** entries: {key: value(obj)}，事务批量 upsert */
  savePrefs(uid, entries) {
    if (!this.db || !entries) return { success: true }
    try {
      const keys = Object.keys(entries)
      if (!keys.length) return { success: true }
      this.db.exec('BEGIN')
      const stmt = this.db.prepare('INSERT OR REPLACE INTO prefs (uid, key, value) VALUES (?,?,?)')
      for (const k of keys) stmt.run(uid, k, encryptJSON(entries[k]))
      this.db.exec('COMMIT')
      return { success: true }
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch {}
      return { success: false, error: e.message }
    }
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
          const m = decryptJSON(r.content)
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

    // 偏好
    store.savePrefs(uid, {
      drafts: data.drafts || {},
      favorites: data.favorites || [],
      mutedConvos: data.mutedConvos || {},
      hiddenConvos: data.hiddenConvos || {},
      deletedMsgIds: data.deletedMsgIds || [],
      stickers: data.stickers || []
    })
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

module.exports = { UserStore, migrateLegacy, importLegacyData, encryptText, decryptText }
