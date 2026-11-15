/** 把主题色变量解析成具体颜色值（悬浮窗没有主题 CSS） */
export function resolveColor(c) {
  const s = String(c || '').trim()
  if (!s) return '#3C8CE7'
  if (s.startsWith('var(')) {
    const name = s.slice(4, s.indexOf(')')).trim()
    const v = name ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : ''
    return v || '#3C8CE7'
  }
  return s
}

export function buildFloatPayload(timer, panelUser, palette) {
  return {
    layout: timer.layout,
    panels: timer.panels.map((p, i) => ({
      index: i,
      name: panelUser(p)?.name || '未选择',
      task: String(p.task || '').trim(),
      color: resolveColor(palette[i]),
      running: p.running,
      done: p.done,
      deadline: p.deadline,
      remaining: p.remaining,
      total: p.total
    }))
  }
}

export function pushTimerFloatState(timer, payloadFn) {
  if (!timer.floatSupported || !timer.float.on) return
  window.api.updateTimerFloat(payloadFn())
}

export function pushTimerFloatConfig(timer) {
  if (!timer.floatSupported || !timer.float.on) return
  window.api.updateTimerFloatConfig({
    pos: timer.float.pos,
    onTop: timer.float.onTop,
    x: timer.float.x,
    y: timer.float.y
  })
}

export function openTimerFloat(timer, pushStateFn) {
  if (!timer.floatSupported) return
  window.api.openTimerFloat({
    pos: timer.float.pos,
    onTop: timer.float.onTop,
    x: timer.float.x,
    y: timer.float.y
  })
  pushStateFn()
}

export function initFloatBridge(timer, { toggleAll, resetAll, toggle, pushConfig, pushState }) {
  if (!timer.floatSupported) return
  window.api.onTimerFloatCommand?.((payload) => {
    const t = payload && payload.type
    if (t === 'toggle-all') toggleAll()
    else if (t === 'reset-all') resetAll()
    else if (t === 'toggle-one') {
      const p = timer.panels[Number(payload.index)]
      if (p) toggle(p)
    } else if (t === 'toggle-pin') {
      timer.float.onTop = !timer.float.onTop
      pushConfig()
    }
  })
  window.api.onTimerFloatClosed?.(() => { timer.float.on = false })
  window.api.onTimerFloatMoved?.((b) => {
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      timer.float.x = b.x
      timer.float.y = b.y
    }
  })
  window.api.isTimerFloatOpen?.().then((open) => {
    if (open) {
      timer.float.on = true
      pushState()
    }
  }).catch(() => {})
}
