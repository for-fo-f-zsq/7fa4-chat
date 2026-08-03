<template>
  <div class="term-panel" :style="{ height: panelHeight + 'px' }">
    <div class="term-resizer" title="拖动调整终端高度" @mousedown="startHeightResize"></div>
    <div class="term-header">
      <span class="term-title"><i class="fas fa-terminal"></i> 终端</span>
      <select v-model="shellType" class="term-shell-select" title="选择 shell（切换后自动重启）" @change="restart">
        <option v-for="s in shellOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <span v-if="!running" class="term-exited" title="进程已退出，可点击重启"><i class="fas fa-circle"></i> 进程已退出</span>
      <span v-else class="term-running" title="运行中"><i class="fas fa-circle"></i> 运行中</span>
      <div class="term-actions">
        <button class="term-btn" title="清屏" @click="clearTerm"><i class="fas fa-eraser"></i></button>
        <button class="term-btn" title="重启终端（以当前工作区为目录）" @click="restart"><i class="fas fa-sync-alt"></i></button>
        <button class="term-btn" title="关闭终端" @click="$emit('close')"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div class="term-strip" :class="{ error: stripError }" :title="stripText">{{ stripText || ' ' }}</div>
    <div ref="termHost" class="term-host"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

defineEmits(['close'])

const props = defineProps({
  cwd: { type: String, default: '' }
})

const FONT_FAMILY = "'JetBrains Mono', 'Sarasa Mono SC', 'Source Han Mono SC', 'NSimSun', Consolas, monospace"

const platform = (navigator.platform || '').toLowerCase()
const isWin = platform.includes('win')
const isMac = platform.includes('mac')
const shellOptions = isWin
  ? [{ value: 'cmd', label: 'CMD' }, { value: 'powershell', label: 'PowerShell' }]
  : isMac
    ? [{ value: 'zsh', label: 'zsh' }, { value: 'bash', label: 'bash' }]
    : [{ value: 'bash', label: 'bash' }, { value: 'zsh', label: 'zsh' }]

const shellType = ref(shellOptions[0].value)
const running = ref(false)
const termHost = ref(null)
const termId = ref(0)
const panelHeight = ref(230)
const stripText = ref('')
const stripError = ref(false)

const BUILD = 'v5'
let baseStrip = ''
let outBytes = 0

function setStrip(text, isErr) {
  baseStrip = text
  stripText.value = text
  stripError.value = !!isErr
}

function bumpOutput(bytes) {
  outBytes += bytes
  stripText.value = `${baseStrip} · 已收到输出 ${outBytes} 字节`
}

let term = null
let fitAddon = null
let resizeObserver = null
let themeObserver = null
let unsubOutput = null
let unsubExit = null
let disposed = false
let diagDone = false
const pendingBuf = new Map()

function themeColors() {
  const cs = getComputedStyle(document.documentElement)
  const get = (v, d) => cs.getPropertyValue(v).trim() || d
  const bg = get('--bg-app', '#101014')
  const fg = get('--text-primary', '#e6e6e6')
  const accent = get('--accent', '#2b6cb0')
  const selBg = /^#[0-9a-f]{6}$/i.test(accent) ? accent + '55' : undefined
  return {
    background: bg,
    foreground: fg,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: selBg,
    selectionForeground: fg
  }
}

function write(data) {
  if (!term || disposed || !data) return
  try { term.write(data) } catch {}
}

function clearTerm() {
  term?.clear()
}

async function saveHeight() {
  try {
    const s = await window.api.loadSetting()
    s.ideTerminalHeight = panelHeight.value
    await window.api.saveSetting(s)
  } catch {}
}

function startHeightResize(e) {
  e.preventDefault()
  const startY = e.clientY
  const startH = panelHeight.value
  const onMove = (ev) => {
    panelHeight.value = Math.max(100, Math.min(Math.round(window.innerHeight * 0.6), startH + (startY - ev.clientY)))
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
    saveHeight()
  }
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function initTerm() {
  term = new Terminal({
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    lineHeight: 1.5,
    cursorBlink: true,
    scrollback: 8000,
    theme: themeColors()
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termHost.value)
  term.onData((data) => {
    if (running.value && termId.value) window.api.termWrite(data)
  })
  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon.fit()
      if (termId.value) window.api.termResize(term.cols, term.rows)
    } catch {}
  })
  resizeObserver.observe(termHost.value)
  themeObserver = new MutationObserver(() => {
    if (term) term.options.theme = themeColors()
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  try { fitAddon.fit() } catch {}
}

// 启动后做一次字体自检：实测浏览器对配置字体栈的解析结果
function writeFontDiag() {
  if (diagDone || !term) return
  diagDone = true
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    ctx.font = '13px ' + FONT_FAMILY
    const wW = ctx.measureText('W').width.toFixed(1)
    const wI = ctx.measureText('i').width.toFixed(1)
    const wZ = ctx.measureText('中').width.toFixed(1)
    const cs = term._core?._charSizeService
    const cellW = cs?.width ?? '?'
    const ok = Math.abs(parseFloat(wW) - parseFloat(wI)) < 0.5
    setStrip(`构建 ${BUILD} · ${ok ? '等宽正常' : '非等宽!'} W=${wW} i=${wI} 中=${wZ} 单元格=${cellW}px · shell=${shellType.value} · ${term.cols}x${term.rows}`)
    const line = ok
      ? `\x1b[2m[字体自检] 等宽正常 W=${wW}px i=${wI}px 中=${wZ}px 单元格=${cellW}px\x1b[0m\r\n`
      : `\x1b[33m[字体警告] 渲染为非等宽 W=${wW}px i=${wI}px 中=${wZ}px 单元格=${cellW}px\x1b[0m\r\n`
    write(line)
  } catch (e) {
    setStrip(`构建 ${BUILD} · 字体自检失败: ${e.message}`, true)
  }
}

async function restart() {
  running.value = false
  try { await window.api.termStop() } catch {}
  termId.value = 0
  clearTerm()
  setStrip(`构建 ${BUILD} · 正在连接 ${shellType.value}…`)
  try {
    const cols = term ? term.cols : 80
    const rows = term ? term.rows : 24
    const r = await window.api.termStart(shellType.value, props.cwd, cols, rows)
    if (r?.success) {
      setStrip(`构建 ${BUILD} · 已连接 (id=${r.id ?? '?'}) · 等待输出…`)
      if (!r.id) {
        write('\r\n\x1b[33m[提示] 检测到旧版主进程（term-start 未返回进程 ID），终端输出可能无法显示。请完全退出应用后重新启动。\x1b[0m\r\n')
      }
      termId.value = r.id
      running.value = true
      const buf = pendingBuf.get(r.id)
      if (buf) { write(buf); pendingBuf.delete(r.id) }
      writeFontDiag()
      nextTick(() => term?.focus())
    } else {
      setStrip(`构建 ${BUILD} · 启动失败: ${r?.error || '未知错误'}`, true)
      write('\r\n[终端启动失败] ' + (r?.error || '未知错误') + '\r\n')
    }
  } catch (e) {
    setStrip(`构建 ${BUILD} · 启动异常: ${e?.message || String(e)}`, true)
    write('\r\n[终端启动失败] ' + (e?.message || String(e)) + '\r\n')
  }
}

onMounted(() => {
  setStrip(`构建 ${BUILD} · 正在初始化…`)
  try {
    window.api.loadSetting().then((s) => {
      if (typeof s?.ideTerminalHeight === 'number' && s.ideTerminalHeight >= 100) {
        panelHeight.value = s.ideTerminalHeight
      }
    }).catch(() => {})
    if (!window.api?.termStart || !window.api?.onTermOutput) {
      setStrip(`构建 ${BUILD} · 错误：preload 缺少终端 API，请完全退出应用重启`, true)
      return
    }
    initTerm()
    setStrip(`构建 ${BUILD} · xterm 已挂载 · 连接 shell…`)
    unsubOutput = window.api.onTermOutput((d) => {
      if (!d?.id) {
        // 兼容旧版主进程：输出事件不带 id，直接显示
        const data = d?.data || ''
        write(data)
        if (data) bumpOutput(data.length)
      } else if (d.id === termId.value) {
        const data = d.data || ''
        write(data)
        if (data) bumpOutput(data.length)
      } else if (pendingBuf.size < 8) {
        pendingBuf.set(d.id, (pendingBuf.get(d.id) || '') + (d.data || ''))
      }
    })
    unsubExit = window.api.onTermExit((d) => {
      if (!d?.id || d.id !== termId.value) return
      running.value = false
      setStrip(`构建 ${BUILD} · 进程已退出 (code=${d.exitCode ?? '?'})`)
      if (d?.error) write('\r\n[终端错误] ' + d.error + '\r\n')
    })
    restart()
  } catch (e) {
    setStrip(`构建 ${BUILD} · 初始化异常: ${e?.message || String(e)}`, true)
  }
})

onBeforeUnmount(() => {
  disposed = true
  if (unsubOutput) unsubOutput()
  if (unsubExit) unsubExit()
  if (resizeObserver) resizeObserver.disconnect()
  if (themeObserver) themeObserver.disconnect()
  window.api.termStop()
  if (term) {
    try { term.dispose() } catch {}
    term = null
  }
})
</script>
