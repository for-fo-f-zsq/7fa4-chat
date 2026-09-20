<template>
  <div class="discover-view" ref="rootEl">
    <div class="discover-header">
      <h2>发现</h2>
      <div class="discover-header-spacer"></div>
      <span class="discover-refresh" :class="{ spinning: loading }" title="刷新推荐" @click="loadRemote">
        <i class="fas fa-sync-alt"></i>
      </span>
    </div>

    <div class="discover-search">
      <i class="fas fa-search discover-search-icon"></i>
      <input class="discover-search-input" v-model="query" placeholder="搜索用户、群聊、聊天记录、收藏…" />
      <span v-if="query" class="discover-search-clear" title="清空" @click="query = ''"><i class="fas fa-times"></i></span>
    </div>

    <!-- 时间过滤（只影响消息检索；接口原生支持 after） -->
    <div class="disc-timefilter" v-if="activeQuery">
      <span :class="{ active: timeRange === '' }" @click="setTimeRange('')">全部时间</span>
      <span :class="{ active: timeRange === 'today' }" @click="setTimeRange('today')">今天</span>
      <span :class="{ active: timeRange === 'week' }" @click="setTimeRange('week')">本周</span>
      <span :class="{ active: timeRange === 'month' }" @click="setTimeRange('month')">本月</span>
    </div>

    <!-- ===== 搜索结果视图 ===== -->
    <template v-if="activeQuery">
      <!-- ===== 专注视图：整页只看某一类的全部结果 ===== -->
      <template v-if="focusKind">
        <div class="disc-focus-head">
          <span class="disc-focus-back" @click="exitFocus"><i class="fas fa-chevron-left"></i> 全部结果</span>
          <span class="disc-focus-title">{{ FOCUS_TITLES[focusKind] }}</span>
          <span class="disc-focus-count">{{ focusCountText }}</span>
        </div>

        <template v-if="focusKind === 'user'">
          <div v-if="!userHitsAll.length" class="disc-none">无匹配</div>
          <div class="disc-row" v-for="u in userHitsAll" :key="'fu' + u.uid" @click="emit('open-user', u.uid)">
            <span class="disc-avatar-sm">{{ initialOf(u) }}</span>
            <div class="disc-row-main">
              <div class="disc-row-name" :style="{ color: nameColorOf(u) }" :title="u.grade || ''">{{ nameOf(u) }}</div>
              <div class="disc-row-sub">{{ subOf(u) }}</div>
            </div>
            <span v-if="u.watchee !== true" class="disc-row-action" @click.stop="emit('add-friend', u.uid)">加好友</span>
          </div>
        </template>

        <template v-else-if="focusKind === 'msg'">
          <div v-if="msgLoading" class="disc-tip">检索中…</div>
          <div v-else-if="msgError" class="disc-tip">{{ msgError }}</div>
          <div v-else-if="!msgHits.length" class="disc-none">无匹配</div>
          <div
            class="disc-row"
            v-for="m in msgHits"
            :key="'fm' + m.kind + m.cid + m.id"
            @click="emit('open-message', { msgId: m.id, convoType: m.kind, convoId: m.cid })"
          >
            <span class="disc-avatar-sm"><i class="fas fa-comment"></i></span>
            <div class="disc-row-main">
              <div class="disc-row-name">
                <span v-html="nameHitHtml(m.sender)"></span><template v-if="m.kind === 'group'"> · {{ store.groups?.[m.cid]?.name || ('群 ' + m.cid) }}</template><template v-else> · <span v-html="nameHitHtml(m.cid)"></span></template>
              </div>
              <div class="disc-row-sub"><span v-html="hitHtml(m)"></span></div>
            </div>
            <span class="disc-row-time">{{ gettime2(m.send_time) }}</span>
          </div>
          <div v-if="msgTotal > msgHits.length && msgHits.length < MSG_HARD_LIMIT" class="disc-more" @click="moreMessages">
            加载更多（还有 {{ remain(msgTotal, msgHits.length) }} 条）
          </div>
          <div v-if="msgTruncated" class="disc-tip">已扫描到上限，结果可能不完整，可加长关键词缩小范围</div>
        </template>

        <template v-else-if="focusKind === 'group'">
          <div v-if="!groupHitsAll.length" class="disc-none">无匹配</div>
          <div class="disc-row" v-for="g in groupHitsAll" :key="'fg' + g.gid" @click="emit('open-convo', { type: 'group', id: g.gid })">
            <span class="disc-avatar-sm"><i class="fas fa-users"></i></span>
            <div class="disc-row-main">
              <div class="disc-row-name">{{ g.name }}</div>
              <div class="disc-row-sub">
                <template v-if="g._match === 'name'">{{ (g.users || []).length }} 名成员</template>
                <template v-else>成员：<span v-html="highlightKeyword(displayName(g._match), activeQuery)"></span></template>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="focusKind === 'fav'">
          <div v-if="!favHitsAll.length" class="disc-none">无匹配</div>
          <div class="disc-row" v-for="f in favHitsAll" :key="'ff' + f.id" @click="emit('open-favorite')">
            <span class="disc-avatar-sm"><i class="fas fa-star"></i></span>
            <div class="disc-row-main">
              <div class="disc-row-sub">{{ favPreview(f) }}</div>
            </div>
          </div>
        </template>
      </template>

      <!-- ===== 三列概览（宽屏并排 / 窄屏竖排）===== -->
      <template v-else>
        <!-- 三列始终渲染（空的一列显示「无匹配」），否则某列为空时后面的列会前移、顺序错乱 -->
        <div class="disc-columns">
          <!-- 1. 用户 -->
          <div class="disc-col">
            <div class="disc-head">
              <div class="disc-title">用户 <em>{{ userHitsAll.length }}</em></div>
              <span v-if="userHitsAll.length > userHits.length" class="disc-more-link" @click="focusOn('user')">查看更多</span>
            </div>
            <div v-if="!userHits.length" class="disc-none">无匹配</div>
            <div class="disc-row" v-for="u in userHits" :key="'u' + u.uid" @click="emit('open-user', u.uid)">
              <span class="disc-avatar-sm">{{ initialOf(u) }}</span>
              <div class="disc-row-main">
                <div class="disc-row-name" :style="{ color: nameColorOf(u) }" :title="u.grade || ''">{{ nameOf(u) }}</div>
                <div class="disc-row-sub">{{ subOf(u) }}</div>
              </div>
              <span v-if="u.watchee !== true" class="disc-row-action" @click.stop="emit('add-friend', u.uid)">加好友</span>
            </div>
          </div>

          <!-- 2. 消息 -->
          <div class="disc-col">
            <div class="disc-head">
              <div class="disc-title">消息 <em v-if="msgTotal">{{ msgTotal }}</em></div>
              <span v-if="msgTotal > msgHits.length" class="disc-more-link" @click="focusOn('msg')">查看更多</span>
            </div>
            <div v-if="msgLoading" class="disc-tip">检索中…</div>
            <div v-else-if="msgError" class="disc-tip">{{ msgError }}</div>
            <div v-else-if="!msgHits.length" class="disc-none">无匹配</div>
            <div
              class="disc-row"
              v-for="m in msgHits"
              :key="'m' + m.kind + m.cid + m.id"
              @click="emit('open-message', { msgId: m.id, convoType: m.kind, convoId: m.cid })"
            >
              <span class="disc-avatar-sm"><i class="fas fa-comment"></i></span>
              <div class="disc-row-main">
                <div class="disc-row-name">
                  <span v-html="nameHitHtml(m.sender)"></span><template v-if="m.kind === 'group'"> · {{ store.groups?.[m.cid]?.name || ('群 ' + m.cid) }}</template><template v-else> · <span v-html="nameHitHtml(m.cid)"></span></template>
                </div>
                <div class="disc-row-sub"><span v-html="hitHtml(m)"></span></div>
              </div>
              <span class="disc-row-time">{{ gettime2(m.send_time) }}</span>
            </div>
          </div>

          <!-- 3. 群聊 -->
          <div class="disc-col">
            <div class="disc-head">
              <div class="disc-title">群聊 <em>{{ groupHitsAll.length }}</em></div>
              <span v-if="groupHitsAll.length > groupHits.length" class="disc-more-link" @click="focusOn('group')">查看更多</span>
            </div>
            <div v-if="!groupHits.length" class="disc-none">无匹配</div>
            <div class="disc-row" v-for="g in groupHits" :key="'g' + g.gid" @click="emit('open-convo', { type: 'group', id: g.gid })">
              <span class="disc-avatar-sm"><i class="fas fa-users"></i></span>
              <div class="disc-row-main">
                <div class="disc-row-name">{{ g.name }}</div>
                <div class="disc-row-sub">
                  <template v-if="g._match === 'name'">{{ (g.users || []).length }} 名成员</template>
                  <template v-else>成员：<span v-html="highlightKeyword(displayName(g._match), activeQuery)"></span></template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 收藏：三列下方通栏 -->
        <div class="disc-section" v-if="favHits.length">
          <div class="disc-head">
            <div class="disc-title">收藏 <em>{{ favHitsAll.length }}</em></div>
            <span v-if="favHitsAll.length > favHits.length" class="disc-more-link" @click="focusOn('fav')">查看更多</span>
          </div>
          <div class="disc-row" v-for="f in favHits" :key="'f' + f.id" @click="emit('open-favorite')">
            <span class="disc-avatar-sm"><i class="fas fa-star"></i></span>
            <div class="disc-row-main">
              <div class="disc-row-sub">{{ favPreview(f) }}</div>
            </div>
          </div>
        </div>
      </template>

      <div class="disc-empty" v-if="!focusKind && !hasAnyHit && !msgLoading">没有匹配结果</div>
    </template>

    <!-- ===== 推荐视图 ===== -->
    <template v-else>
      <div class="disc-section" v-if="peopleList.length">
        <div class="disc-title">可能认识的人 <em>{{ peopleList.length }}</em></div>
        <div class="disc-grid">
          <div class="disc-card" v-for="p in peopleList" :key="p.uid" @click="emit('open-user', p.uid)">
            <span class="disc-avatar">{{ p._initial }}</span>
            <div class="disc-card-name" :style="{ color: p._color }" :title="p.grade || ''">{{ nameOf(p) }}</div>
            <div class="disc-card-sub">{{ subOf(p) }}</div>
            <div class="disc-card-tags">
              <span v-if="isWatcher(p.uid)" class="disc-tag watch">TA 已关注你</span>
              <span v-if="p.match" class="disc-tag">{{ p.match }}</span>
              <span class="disc-tag muted">{{ lastActiveText(p.last_seen) }}</span>
            </div>
            <span v-if="!isFollowed(p.uid)" class="disc-card-btn" @click.stop="emit('add-friend', p.uid)">加好友</span>
            <span v-else class="disc-card-btn muted">已关注</span>
          </div>
        </div>
      </div>

      <div class="disc-section" v-if="groupRecs.length">
        <div class="disc-title">可能相关的群 <em>{{ groupRecs.length }}</em></div>
        <div class="disc-row" v-for="g in groupRecs" :key="'rg' + g.gid">
          <span class="disc-avatar-sm"><i class="fas fa-users"></i></span>
          <div class="disc-row-main">
            <div class="disc-row-name">{{ g.title }}</div>
            <div class="disc-row-sub">{{ g.reason }} · {{ g.members }} 人</div>
          </div>
        </div>
      </div>

      <div class="disc-empty" v-if="!peopleList.length && !groupRecs.length">
        <template v-if="loading">正在获取推荐…</template>
        <template v-else-if="loadError">
          推荐获取失败：{{ loadError }}<br />
          <span class="disc-retry" @click="loadRemote">重试</span>
        </template>
        <template v-else-if="remotePeople.length">
          候选用户都已经是你的好友了。
        </template>
        <template v-else>
          暂无推荐，试试用上方搜索框找人。
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { store } from '../store.js'
import { gettime2, displayName, getInitialOfUser, getNameColorFor, highlightKeyword, parseMsgContent, searchAllMessages } from '../utils.js'

const emit = defineEmits(['open-user', 'add-friend', 'open-convo', 'open-message', 'open-favorite'])

const query = ref('')
const activeQuery = ref('')

// ---------- 推荐：完全来自服务端聚合 ----------
// 数据源 = 客户端上报的本人档案（POST /info 白名单落盘）经服务端分桶排序后的结果。
// 客户端只做一层过滤：已是我关注的人不再推荐（服务端不知道好友关系）。
const remotePeople = ref([])
const loading = ref(false)
const loadError = ref('')

function isFollowed(uid) {
  return (store.users || {})[uid]?.watchee === true
}

/** 对方关注了我（还没互关）—— 最值得回关的一批人，卡片上要标注 */
function isWatcher(uid) {
  return (store.users || {})[uid]?.watcher === true
}

// 服务端已按接近度排序（同班 > 同年级 > 同校 > 其余兜底）；这里只剔除已关注者并限制展示数量。
// 不做分层过滤 —— 只要还存在未关注的候选，列表就一定有内容。
const PEOPLE_MAX = 10
// 预计算首字与颜色：getNameColorFor 内部要读 CSS 变量（getComputedStyle 会强制样式重算），
// 若放在模板里逐帧调用代价高；这里只在数据变化时算一次。
const peopleList = computed(() =>
  remotePeople.value
    .filter((p) => p && p.uid != null && !isFollowed(p.uid))
    .slice(0, PEOPLE_MAX)
    .map((p) => ({
      ...p,
      _initial: getInitialOfUser(p),
      _color: getNameColorFor(p.uid, p.grade)
    }))
)

const groupRecs = ref([])

function nameOf(u) {
  if (!u) return ''
  return displayName(u) || u.nickname || u.username || `User_${u.uid}`
}

// 推荐对象来自服务端、不在 store.users 里 —— 首字与颜色必须基于对象自身字段计算。
// （getAvatarInitial / getGradeColor 的参数是 uid 且内部查 store.users，传对象会得到 "[" 之类的脏值）
function initialOf(u) {
  return getInitialOfUser(u)
}

function nameColorOf(u) {
  return u ? getNameColorFor(u.uid, u.grade) : ''
}

function subOf(u) {
  if (!u) return ''
  const cls = u.grade_class ? `${u.grade_class} 班` : ''
  return [u.grade, cls].filter(Boolean).join(' · ') || (u.username || '')
}

/** 最后活跃时间的人话描述（服务端返回 last_seen 时间戳） */
function lastActiveText(ts) {
  const t = Number(ts) || 0
  if (!t) return '未见活跃'
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return '今天活跃'
  if (days === 1) return '昨天活跃'
  return days + ' 天前活跃'
}

// ---------- 聚合搜索 ----------
// 各分区默认最多显示 PAGE_SIZE 条，超出部分由「查看更多」逐步追加（避免一次刷出成百上千条）
const PAGE_SIZE = 10
const MSG_HARD_LIMIT = 200 // 与存储层 searchMessages 的 limit 上限保持一致
const SEARCH_SCAN_CAP = 200 // 用户分区最多扫出的候选数（ranklist 全站用户可能很多）

// 时间过滤（消息检索的 after 参数；接口原生支持，这里只补 UI）
const timeRange = ref('')
const TIME_RANGES = { today: 86400000, week: 7 * 86400000, month: 30 * 86400000 }
function setTimeRange(r) {
  timeRange.value = r
  if (activeQuery.value) runMessageSearch(activeQuery.value) // 只影响消息检索
}
const userLimit = ref(PAGE_SIZE)
const groupLimit = ref(PAGE_SIZE)
const favLimit = ref(PAGE_SIZE)
const msgLimit = ref(PAGE_SIZE)

/** 剩余可展示数量（供「查看更多」文案使用） */
function remain(total, shownLimit) {
  return Math.max(0, Number(total || 0) - Number(shownLimit || 0))
}

function matchUser(u, q) {
  return [u.nickname, u.username, u.realname, u.note, String(u.uid)].join(' ').toLowerCase().includes(q)
}

const userHitsAll = computed(() => {
  const q = activeQuery.value.toLowerCase()
  if (!q) return []
  const out = []
  for (const u of Object.values(store.users || {})) {
    if (!u || u.uid == null) continue
    if (!matchUser(u, q)) continue
    out.push(u)
    if (out.length >= SEARCH_SCAN_CAP) break
  }
  return out
})

const groupHitsAll = computed(() => {
  const q = activeQuery.value.toLowerCase()
  if (!q) return []
  // 群名命中排前；搜人名也能搜到「包含该成员的群」（成员名取自 store.users：
  // 好友 + ranklist 全站快照，覆盖面取决于本地已有数据）
  const byName = []
  const byMember = []
  for (const g of Object.values(store.groups || {})) {
    if (!g || g.exited) continue
    if (String(g.name || '').toLowerCase().includes(q)) {
      byName.push({ ...g, _match: 'name' })
      continue
    }
    const member = (g.users || []).map((m) => store.users?.[m.user_id]).find((u) => u && matchUser(u, q))
    if (member) byMember.push({ ...g, _match: member })
  }
  return byName.concat(byMember)
})

const favHitsAll = computed(() => {
  const q = activeQuery.value.toLowerCase()
  if (!q) return []
  return (store.favorites || []).filter((f) => {
    const hay = [favPreview(f), f.note || '', (f.tags || []).join(' ')].join(' ').toLowerCase()
    return hay.includes(q)
  })
})

const userHits = computed(() => userHitsAll.value.slice(0, userLimit.value))
const groupHits = computed(() => groupHitsAll.value.slice(0, groupLimit.value))
const favHits = computed(() => favHitsAll.value.slice(0, favLimit.value))

// ---------- 专注视图：整页只看某一类的全部结果 ----------
const FOCUS_TITLES = { user: '用户', msg: '消息', group: '群聊', fav: '收藏' }
const focusKind = ref('')
const rootEl = ref(null)

function focusOn(kind) {
  focusKind.value = kind
  // 消息进入专注视图时一次取满（存储层上限 200），避免还要反复点加载更多
  if (kind === 'msg' && msgLimit.value < MSG_HARD_LIMIT) {
    msgLimit.value = MSG_HARD_LIMIT
    runMessageSearch(activeQuery.value)
  }
  scrollTop()
}

function exitFocus() {
  focusKind.value = ''
  scrollTop()
}

/** 视图整体切换时回到顶部，否则会停在上一个视图的滚动位置 */
function scrollTop() {
  nextTick(() => {
    try { rootEl.value?.scrollTo({ top: 0 }) } catch {}
  })
}

const focusCountText = computed(() => {
  if (focusKind.value === 'msg') return String(msgTotal.value || 0)
  if (focusKind.value === 'user') return String(userHitsAll.value.length)
  if (focusKind.value === 'group') return String(groupHitsAll.value.length)
  if (focusKind.value === 'fav') return String(favHitsAll.value.length)
  return ''
})

function resetLimits() {
  userLimit.value = PAGE_SIZE
  groupLimit.value = PAGE_SIZE
  favLimit.value = PAGE_SIZE
  msgLimit.value = PAGE_SIZE
  focusKind.value = '' // 换关键词时退出专注视图，回到三列概览
}

function favPreview(f) {
  const obj = parseMsgContent(f.content)
  if (!obj) return (f.content || '').slice(0, 60)
  if (obj.type === 'text') return (obj.content || '').slice(0, 60)
  if (obj.type === 'file') return '📄 ' + (obj.name || '')
  if (obj.type === 'sticker') return '🖼️ ' + (obj.name || '表情')
  if (obj.type === 'emoji') return obj.content || ''
  return (f.content || '').slice(0, 60)
}

const msgHits = ref([])
const msgTotal = ref(0)
const msgTruncated = ref(false)
const msgLoading = ref(false)
const msgError = ref('')

const hasAnyHit = computed(() => userHits.value.length || groupHits.value.length || msgHits.value.length || favHits.value.length)

/** 发送者 / 会话对方的名字（带关键词高亮）：搜「张三」时，张三发的消息其名字变色显示 */
function nameHitHtml(uid) {
  const u = store.users?.[uid]
  const name = u ? displayName(u) : `User_${uid}`
  return highlightKeyword(name, activeQuery.value)
}

/** 命中片段：高亮关键词（highlightKeyword 内部已做 HTML 转义） */
function hitHtml(m) {
  const t = m.snippet || ''
  return t ? highlightKeyword(t, activeQuery.value) : '（无文本内容）'
}

let debounceTimer = null
watch(query, (v) => {
  clearTimeout(debounceTimer)
  const t = v.trim()
  if (!t) {
    activeQuery.value = ''
    msgHits.value = []
    msgTotal.value = 0
    msgTruncated.value = false
    msgError.value = ''
    msgLoading.value = false
    resetLimits()
    return
  }
  debounceTimer = setTimeout(() => {
    activeQuery.value = t
    resetLimits()
    msgHits.value = [] // 立刻清空，避免「旧结果 + 新查询加载中」并存造成误导
    runMessageSearch(t)
  }, 300)
})

/** 聊天记录「查看更多」：加大取回条数后重新检索（存储层 limit 上限 200） */
function moreMessages() {
  msgLimit.value = Math.min(msgLimit.value + PAGE_SIZE, MSG_HARD_LIMIT)
  runMessageSearch(activeQuery.value)
}

// 请求序号：连续点「查看更多」会并发多个请求，只接受最后一个的返回 ——
// 否则先发的（limit 更小）后到，会把结果覆盖成更少的那一份。
let msgReqSeq = 0

async function runMessageSearch(q) {
  const seq = ++msgReqSeq
  msgLoading.value = true
  msgError.value = ''
  try {
    // 微信式搜索：命中的用户，其发出的消息也一并带出（不只匹配消息正文）
    // 用 userHitsAll（而非仅展示的前 N 个），否则「查看更多」会让发送者范围反而变小
    const senders = userHitsAll.value.map((u) => u.uid).filter(Boolean)
    // ⚠️ 消息的 send_time 是「秒」级时间戳（gettime2 = new Date(t*1000)），after 必须同为秒，
    //    否则毫秒 after 恒大于所有 send_time → 结果恒为空（踩过）。
    const span = TIME_RANGES[timeRange.value]
    const after = span ? Math.floor((Date.now() - span) / 1000) : undefined
    const r = await searchAllMessages({ q, senders, limit: msgLimit.value, after })
    if (seq !== msgReqSeq) return // 已有更新的请求，丢弃本次结果
    if (r && r.success) {
      msgHits.value = r.data || []
      msgTotal.value = r.total || 0
      msgTruncated.value = !!r.truncated
    } else {
      msgHits.value = []
      msgTotal.value = 0
      msgError.value = (r && r.error) || '检索不可用'
    }
  } catch (e) {
    if (seq === msgReqSeq) msgError.value = '检索失败'
  } finally {
    if (seq === msgReqSeq) msgLoading.value = false
  }
}

// ---------- 拉取服务端推荐 ----------
async function loadRemote() {
  loading.value = true
  loadError.value = ''
  try {
    const uid = store.self?.uid
    if (!uid) { loadError.value = '未登录'; return }
    const fn = window.api?.fetchDiscoverPeople
    if (typeof fn !== 'function') { loadError.value = '当前平台不支持推荐'; return }
    // 全量拉取（服务端 limit 上限 200，约百条/20KB）：
    // 接近度最高的那批往往恰好是已关注的好友（同班同校评分高、排最前），会被客户端过滤掉 ——
    // 请求量不足时过滤后剩不下几条（曾只请求 30 条，过滤后只剩 5 个可展示）。
    const r = await fn(uid, 200)
    if (r && r.success) {
      remotePeople.value = Array.isArray(r.items) ? r.items : []
    } else {
      remotePeople.value = []
      loadError.value = (r && r.error) || '推荐获取失败'
    }
  } catch (e) {
    remotePeople.value = []
    loadError.value = e.message || '推荐获取失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadRemote)
// 多账号切换：uid 变化后重新拉取，否则会停留在上一个账号的推荐结果
watch(
  () => store.self?.uid,
  (v, old) => {
    if (v && v !== old) loadRemote()
  }
)
</script>
