import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildNoticeUpdateUrl,
  normalizeNotice,
  normalizeNoticeFlag,
  normalizeNoticeTimestamp,
  parseNoticeTextSegments,
  parseNoticesPayload,
  resolveNoticeJumpUrl,
} from '../../src/renderer/src/utils/notices.js'

// 1. flag normalization handles 0/'0'/''/false vs 1/'1'/true/'true'
assert.equal(normalizeNoticeFlag(1), true)
assert.equal(normalizeNoticeFlag('1'), true)
assert.equal(normalizeNoticeFlag(true), true)
assert.equal(normalizeNoticeFlag('true'), true)
assert.equal(normalizeNoticeFlag(0), false)
assert.equal(normalizeNoticeFlag('0'), false)
assert.equal(normalizeNoticeFlag(''), false)
assert.equal(normalizeNoticeFlag(false), false)
assert.equal(normalizeNoticeFlag(null), false)

// 2. timestamp normalization (seconds vs ms)
assert.equal(normalizeNoticeTimestamp(1732291200), 1732291200)
assert.equal(normalizeNoticeTimestamp(1732291200123), 1732291200)
assert.equal(normalizeNoticeTimestamp('invalid'), 0)

// 3. normalizeNotice + parseNoticesPayload supports array & { success, notices }
const n1 = normalizeNotice({
  id: '15',
  user_id: 7,
  date: 1700000100,
  notice_text: '请完成本周作业',
  jump_url: '/problem/100',
  checked: 0,
  noticed: '0',
})
assert.deepEqual(n1, {
  id: 15,
  user_id: 7,
  date: 1700000100,
  notice_text: '请完成本周作业',
  jump_url: '/problem/100',
  checked: false,
  noticed: false,
})
assert.equal(normalizeNotice({ id: 0 }), null)

const fromArray = parseNoticesPayload([
  { id: 10, date: 100, notice_text: 'old', checked: 1, noticed: 1 },
  { id: 12, date: 200, notice_text: 'new', checked: 0, noticed: 0 },
  { id: 12, date: 200, notice_text: 'dup', checked: 1, noticed: 0 },
])
assert.equal(fromArray.ok, true)
assert.deepEqual(fromArray.notices.map((x) => x.id), [12, 10])
assert.equal(fromArray.notices[0].checked, true)

const fromEnvelope = parseNoticesPayload({
  success: true,
  notices: [{ id: 3, date: 300, notice_text: 'env', checked: false, noticed: false }],
})
assert.equal(fromEnvelope.ok, true)
assert.equal(fromEnvelope.notices.length, 1)
assert.equal(parseNoticesPayload({ success: false, notices: [] }).ok, false)

// 4. buildNoticeUpdateUrl supports '1' and ''
assert.equal(buildNoticeUpdateUrl(42, 'noticed', '1'), '/notice/42/noticed/1')
assert.equal(buildNoticeUpdateUrl(42, 'checked', '1'), '/notice/42/checked/1')
assert.equal(buildNoticeUpdateUrl(42, 'checked', ''), '/notice/42/checked/')
assert.equal(buildNoticeUpdateUrl(42, 'noticed', false), '/notice/42/noticed/')
assert.throws(() => buildNoticeUpdateUrl(0, 'checked', '1'))
assert.throws(() => buildNoticeUpdateUrl(5, 'other', '1'))

// 5. resolveNoticeJumpUrl handles relative OJ paths, full https URLs, and blocks XSS protocols
assert.equal(resolveNoticeJumpUrl('/contest/18', 'https://jx.7fa4.cn:8888'), 'https://jx.7fa4.cn:8888/contest/18')
assert.equal(resolveNoticeJumpUrl('https://jx.7fa4.cn:8888/problem/1', 'https://jx.7fa4.cn:8888'), 'https://jx.7fa4.cn:8888/problem/1')
assert.equal(resolveNoticeJumpUrl('javascript:alert(1)', 'https://jx.7fa4.cn:8888'), '')
assert.equal(resolveNoticeJumpUrl('//evil.example/x', 'https://jx.7fa4.cn:8888'), '')

// 6. parseNoticeTextSegments safely extracts links and strips unsafe tags
const segs = parseNoticeTextSegments(
  '比赛通知：<a href="/contest/9">点此进入</a>，勿信<script>alert(1)</script><a href="javascript:xss()">坏链接</a>',
  'https://jx.7fa4.cn:8888',
)
assert.deepEqual(segs, [
  { type: 'text', text: '比赛通知：' },
  { type: 'link', text: '点此进入', url: 'https://jx.7fa4.cn:8888/contest/9' },
  { type: 'text', text: '，勿信alert(1)坏链接' },
])

// 7. Proxy wiring, screen bottom-right Electron window, no extra UI, settings entry, and no auto-close timer
const root = resolve(process.cwd())
const mainSrc = readFileSync(resolve(root, 'src/main/index.js'), 'utf8')
const viteCfg = readFileSync(resolve(root, 'config/electron.vite.config.js'), 'utf8')
const webApiSrc = readFileSync(resolve(root, 'src/renderer/src/platform/web-api.js'), 'utf8')
const preloadSrc = readFileSync(resolve(root, 'src/preload/index.js'), 'utf8')
const siteNoticePreload = readFileSync(resolve(root, 'src/preload/site-notice.js'), 'utf8')
const siteNoticeHtml = readFileSync(resolve(root, 'src/renderer/site-notice.html'), 'utf8')
const popupSrc = readFileSync(resolve(root, 'src/renderer/src/components/modals/NoticePopup.vue'), 'utf8')
const navSrc = readFileSync(resolve(root, 'src/renderer/src/components/common/NavBar.vue'), 'utf8')
const settingsSrc = readFileSync(resolve(root, 'src/renderer/src/components/panels/SettingsPanel.vue'), 'utf8')
const pollingSrc = readFileSync(resolve(root, 'src/renderer/src/composables/chat/usePollingSync.js'), 'utf8')

assert.match(mainSrc, /serverApp\.use\('\/notices'/)
assert.match(mainSrc, /serverApp\.use\('\/notice'/)
assert.match(mainSrc, /siteNoticeBottomRightPos/)
assert.match(mainSrc, /workArea\.x \+ workArea\.width/)
assert.match(mainSrc, /workArea\.y \+ workArea\.height/)
assert.match(mainSrc, /siteNoticeWin\.setAlwaysOnTop\(true, 'screen-saver'\)/)
assert.match(mainSrc, /site-notice-sync/)
assert.match(pollingSrc, /try \{ await probeTargetTimes\(true\) \} catch \{\}/)
assert.equal(/NOTICE_EVERY_MS/.test(pollingSrc), false, 'notices must poll every round without throttle')
assert.match(viteCfg, /'\/notices'/)
assert.match(viteCfg, /'\/notice'/)
assert.match(viteCfg, /'site-notice': resolve\('src\/preload\/site-notice\.js'\)/)
assert.match(viteCfg, /'site-notice': resolve\('src\/renderer\/site-notice\.html'\)/)
assert.match(webApiSrc, /'\/notices'/)
assert.match(webApiSrc, /'\/notice'/)
assert.match(preloadSrc, /syncSiteNotice/)
assert.match(preloadSrc, /onSiteNoticeConfirm/)
assert.match(siteNoticePreload, /contextBridge\.exposeInMainWorld\('siteNotice'/)
assert.equal(/setTimeout|setInterval/.test(siteNoticeHtml), false, 'site-notice.html must not auto-close on a timer')
assert.equal(/setTimeout|setInterval/.test(popupSrc), false, 'NoticePopup must not auto-close on a timer')
assert.equal(existsSync(resolve(root, 'src/renderer/src/components/modals/NoticeModal.vue')), false)
assert.equal(/useNotices|openNoticeModal|fa-bell/.test(navSrc), false, 'NavBar must not add notice UI')
assert.match(settingsSrc, /sendTestSiteNotice/)
assert.match(settingsSrc, /不可关闭/)

console.log('test-notices passed')
