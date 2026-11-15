import { store } from '../../../../store.js'
import { getAvatarInitial, getGradeColor, ranklistOrder, usersJson } from '../../../../utils.js'

export function filterTimerUsers(query) {
  const q = String(query || '').trim().toLowerCase()
  const out = []
  const seen = new Set()

  const push = (uid, u) => {
    if (!uid || seen.has(uid)) return
    seen.add(uid)
    const info = usersJson?.[uid]
    const realName = info?.name || u?.realname || u?.nickname || u?.username || `User_${uid}`
    const nickname = u?.nickname || ''
    const username = u?.username || ''
    if (q) {
      const hay = [info?.name, u?.realname, nickname, username, String(uid)].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return
    }
    const meta = [String(uid), nickname, username].filter(Boolean).join(' / ')
    out.push({
      uid,
      realName,
      meta: uid === store.self?.uid ? `（我）${meta}` : meta,
      initial: getAvatarInitial(uid),
      gradeColor: getGradeColor(uid)
    })
  }

  for (const uid of ranklistOrder) {
    if (store.users[uid]) push(uid, store.users[uid])
  }
  for (const [uidStr, u] of Object.entries(store.users || {})) {
    push(Number(uidStr), u)
  }
  return out.slice(0, 300)
}
