<template>
  <div class="pdf-viewer">
    <div class="pdf-toolbar">
      <span class="pdf-page-ind">共 {{ numPages }} 页</span>
      <div class="img-tool-sep"></div>
      <button class="img-tool-btn" title="缩小" @click="zoomBy(-0.15)"><i class="fas fa-search-minus"></i></button>
      <span class="pdf-zoom-ind">{{ Math.round(zoomScale * 100) }}%</span>
      <button class="img-tool-btn" title="放大" @click="zoomBy(0.15)"><i class="fas fa-search-plus"></i></button>
    </div>

    <div ref="wrapEl" class="img-canvas-wrap pdf-wrap" @scroll="onScroll">
      <div class="pdf-pages" :style="{ minWidth: pagesWidth + 'px' }">
        <div
          v-for="n in pageRange"
          :key="n"
          class="pdf-page"
          :style="{ height: (pageHeights[n] || 0) + 'px' }"
        >
          <canvas
            :data-page="n"
            class="pdf-page-canvas"
            :style="{ width: pagesWidth + 'px', height: (pageHeights[n] || 0) + 'px' }"
          ></canvas>
        </div>
      </div>
      <div v-if="loading" class="img-overlay"><i class="fas fa-spinner fa-spin"></i> 加载中…</div>
      <div v-if="loadError" class="img-overlay img-overlay-error">
        <i class="fas fa-exclamation-triangle"></i> {{ loadError }}
      </div>
    </div>

    <div class="img-footer">
      <span class="img-meta">{{ relPath }} · {{ numPages }} 页</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps({
  workspace: { type: String, required: true },
  relPath: { type: String, required: true }
})

const wrapEl = ref(null)
const numPages = ref(0)
const zoomScale = ref(1)
const loading = ref(true)
const loadError = ref('')
const pagesWidth = ref(900)
const pageHeights = ref([])

const pageViews = [] // scale=1 的页面尺寸 { w, h }
const pageTops = [] // 每页顶部的累计滚动位置
const rendered = {}
const rendering = {}

const pageRange = computed(() => Array.from({ length: numPages.value }, (_, i) => i + 1))

let pdfDoc = null
let loadingTask = null
let scrollRaf = null
let resizeHandler = null

function b64ToUint8(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function wrapWidth() {
  return Math.max((wrapEl.value?.clientWidth || 900) - 4, 200)
}

// 计算所有页的显示尺寸与累计位置
function computeLayout() {
  pagesWidth.value = Math.round(wrapWidth() * zoomScale.value)
  let top = 0
  for (let n = 1; n <= numPages.value; n++) {
    const v = pageViews[n]
    const h = v ? Math.round((pagesWidth.value * v.h) / v.w) : 200
    pageHeights.value[n] = h
    pageTops[n] = top
    top += h + 14
  }
}

async function layoutAll() {
  for (let n = 1; n <= numPages.value; n++) {
    const p = await pdfDoc.getPage(n)
    const v = p.getViewport({ scale: 1 })
    pageViews[n] = { w: v.width, h: v.height }
  }
  computeLayout()
}

function clearRendered() {
  for (const k of Object.keys(rendered)) delete rendered[k]
  for (const k of Object.keys(rendering)) delete rendering[k]
  if (wrapEl.value) {
    wrapEl.value.querySelectorAll('.pdf-page-canvas').forEach((c) => {
      c.width = 0
      c.height = 0
    })
  }
}

async function renderPage(n) {
  if (rendered[n] || rendering[n]) return
  const canvas = wrapEl.value?.querySelector(`.pdf-page-canvas[data-page="${n}"]`)
  if (!canvas) return
  rendering[n] = true
  try {
    const v = pageViews[n]
    if (!v) return
    const pdfPage = await pdfDoc.getPage(n)
    const rs = pagesWidth.value / v.w
    const viewport = pdfPage.getViewport({ scale: rs })
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    rendered[n] = true
  } catch (e) {
    if (e?.name === 'RenderingCancelledException') return
    console.error('[pdf] 渲染第', n, '页失败:', e)
  } finally {
    delete rendering[n]
  }
}

// 只渲染视口附近（前后各一屏）的页面
function renderVisible() {
  const el = wrapEl.value
  if (!el || !pdfDoc) return
  const top = el.scrollTop
  const bottom = top + el.clientHeight
  for (let n = 1; n <= numPages.value; n++) {
    if (rendered[n]) continue
    const pTop = pageTops[n] || 0
    const pBottom = pTop + (pageHeights.value[n] || 0)
    if (pBottom < top - el.clientHeight || pTop > bottom + el.clientHeight) continue
    renderPage(n)
  }
}

function onScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null
    renderVisible()
  })
}

function reflow() {
  const oldW = pagesWidth.value
  computeLayout()
  clearRendered()
  const ratio = pagesWidth.value / (oldW || pagesWidth.value)
  const el = wrapEl.value
  if (el && ratio > 0) el.scrollTop = el.scrollTop * ratio
  renderVisible()
}

function zoomBy(delta) {
  zoomScale.value = Math.max(0.5, Math.min(2.5, Math.round((zoomScale.value + delta) * 100) / 100))
  reflow()
}

// Ctrl + 滚轮缩放
function onWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  zoomBy(e.deltaY < 0 ? 0.15 : -0.15)
}

onMounted(async () => {
  resizeHandler = () => reflow()
  window.addEventListener('resize', resizeHandler)
  wrapEl.value?.addEventListener('wheel', onWheel, { passive: false })
  try {
    const r = await window.api.toolReadRawFile(props.workspace, props.relPath)
    if (!r.success) {
      loadError.value = r.error || '读取失败'
      return
    }
    loadingTask = getDocument({ data: b64ToUint8(r.data) })
    pdfDoc = await loadingTask.promise
    numPages.value = pdfDoc.numPages
    await layoutAll()
    requestAnimationFrame(() => requestAnimationFrame(renderVisible))
  } catch (e) {
    loadError.value = e.message || 'PDF 解析失败'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeHandler)
  wrapEl.value?.removeEventListener('wheel', onWheel)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  if (loadingTask) {
    loadingTask.destroy()
    loadingTask = null
  }
  pdfDoc = null
})
</script>
