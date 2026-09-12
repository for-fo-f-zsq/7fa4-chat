<template>
  <div class="md-tool" :class="{ narrow: isNarrow }">
    <div class="md-tool-header">
      <div class="md-tool-title">
        <button class="md-back-btn" title="返回" @click="onBack"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-file-alt"></i> 工具
        <span class="md-tool-sep">/</span>
        Markdown 编辑
      </div>
      <div class="md-workspace-bar">
        <i class="fas fa-file-alt"></i>
        <input
          v-if="editingName"
          ref="nameInputRef"
          v-autofocus
          v-model="fileNameDraft"
          class="md-name-input"
          spellcheck="false"
          @keydown.enter="commitName"
          @keydown.esc="cancelName"
          @blur="commitName"
        />
        <span v-else class="md-workspace-path md-name-edit" :title="'点击修改文件名' + (fileName ? '：' + fileName : '')" @click="startEditName">
          {{ fileName || '未命名' }}<i class="fas fa-pencil-alt md-name-edit-icon"></i>
        </span>
        <button class="md-ws-btn md-ws-btn-icon" title="打开文件" @click="openFile"><i class="fas fa-folder-open"></i></button>
        <button class="md-ws-btn md-ws-btn-icon" title="新建文件" @click="newFile"><i class="fas fa-file"></i></button>
        <button class="md-ws-btn md-ws-btn-icon" title="保存到文件 (Ctrl+S)" :disabled="saving" @click="save"><i class="fas fa-save"></i></button>
        <button class="md-ws-btn md-ws-btn-icon" title="导出为图片" :disabled="exporting" @click="exportPng"><i class="fas fa-image"></i></button>
      </div>
    </div>

    <div class="md-tool-body">
      <div ref="editorRootEl" class="md-editor" @dragover.prevent @drop.prevent="onDropFile">

        <!-- 工具栏 -->
        <div class="md-toolbar" role="toolbar" aria-label="格式工具栏">
          <div class="md-tb-group">
            <button class="md-tb-btn" title="撤销 (Ctrl+Z)" :disabled="!canUndo" @click="undo"><i class="fas fa-undo"></i></button>
            <button class="md-tb-btn" title="重做 (Ctrl+Y)" :disabled="!canRedo" @click="redo"><i class="fas fa-redo"></i></button>
          </div>
          <div class="md-tb-sep"></div>
          <div class="md-tb-group">
            <button class="md-tb-btn" title="加粗 (Ctrl+B)" @click="insertBold"><i class="fas fa-bold"></i></button>
            <button class="md-tb-btn" title="斜体 (Ctrl+I)" @click="insertItalic"><i class="fas fa-italic"></i></button>
            <button class="md-tb-btn" title="删除线 (Ctrl+D)" @click="insertStrikethrough"><i class="fas fa-strikethrough"></i></button>
            <button class="md-tb-btn" title="行内代码" @click="insertInlineCode"><i class="fas fa-code"></i></button>
            <button class="md-tb-btn" title="引用 (Ctrl+Shift+Q)" @click="insertQuote"><i class="fas fa-quote-left"></i></button>
          </div>
          <div class="md-tb-sep"></div>
          <div class="md-tb-group">
            <button class="md-tb-btn md-tb-txt" title="一级标题" @click="insertHeading(1)">H1</button>
            <button class="md-tb-btn md-tb-txt" title="二级标题" @click="insertHeading(2)">H2</button>
            <button class="md-tb-btn md-tb-txt" title="三级标题" @click="insertHeading(3)">H3</button>
            <button class="md-tb-btn" title="水平线 (Ctrl+Shift+H)" @click="insertHR"><i class="fas fa-minus"></i></button>
          </div>
          <div class="md-tb-sep"></div>
          <div class="md-tb-group">
            <button class="md-tb-btn" title="插入链接 (Ctrl+K)" @click="linkVisible = true"><i class="fas fa-link"></i></button>
            <button class="md-tb-btn" title="插入图片 (Ctrl+Shift+I)" @click="imageVisible = true"><i class="fas fa-image"></i></button>
            <button class="md-tb-btn" title="插入代码块 (Ctrl+Shift+1)" @click="codeVisible = true"><i class="fas fa-file-code"></i></button>
            <button class="md-tb-btn" title="表格生成器 (Ctrl+Shift+2)" @click="openTableBuilder()"><i class="fas fa-table"></i></button>
            <button class="md-tb-btn" title="插入折叠框" @click="calloutVisible = true"><i class="fas fa-box-archive"></i></button>
            <button class="md-tb-btn" title="插入引言" @click="epigraphVisible = true"><i class="fas fa-feather"></i></button>
            <button class="md-tb-btn" title="插入 Bilibili 视频" @click="bilibiliVisible = true"><i class="fas fa-tv"></i></button>
            <button class="md-tb-btn" title="数学公式面板 (Ctrl+M)" @click="openMathPanel"><i class="fas fa-square-root-variable"></i></button>
          </div>
          <div class="md-tb-group md-tb-right">
            <button class="md-tb-btn" :class="{ active: scrollSyncOn }" :title="'滚动同步：' + (scrollSyncOn ? '开' : '关')" @click="toggleScrollSync()">
              <i class="fas fa-arrows-up-down"></i>
            </button>
            <div class="md-tb-sep"></div>
            <button class="md-tb-btn" :class="{ active: viewMode === 'split' }" title="双栏对比" @click="setViewMode('split')"><i class="fas fa-table-columns"></i></button>
            <button class="md-tb-btn" :class="{ active: viewMode === 'editor-only' }" title="纯编辑" @click="setViewMode('editor-only')"><i class="fas fa-pen"></i></button>
            <button class="md-tb-btn" :class="{ active: viewMode === 'preview-only' }" title="纯预览" @click="setViewMode('preview-only')"><i class="fas fa-eye"></i></button>
            <button class="md-tb-btn" :class="{ active: viewMode === 'typora' }" title="所见即所得（点击段落就地编辑）" @click="setViewMode('typora')"><i class="fas fa-i-cursor"></i></button>
          </div>
        </div>

        <!-- 工作区 -->
        <div ref="workspaceEl" class="md-workspace" :class="'mode-' + viewMode">
          <section v-show="viewMode === 'split' || viewMode === 'editor-only'" ref="editorPaneEl" class="md-pane md-pane-editor" :style="editorPaneStyle">
            <textarea
              ref="taEl"
              v-model="content"
              class="md-source"
              placeholder="在此输入 Markdown 内容，右侧实时渲染……"
              spellcheck="false"
              @input="onInput"
              @keydown="onKeydown"
              @scroll="onEditorScroll"
            ></textarea>
            <div class="md-gutter" ref="gutterEl" aria-hidden="true"></div>
          </section>

          <div v-show="viewMode === 'split'" class="md-divider" role="separator" aria-orientation="vertical" aria-label="调整编辑区与预览区宽度" @pointerdown="onSplitPointerDown"></div>

          <section v-show="viewMode !== 'editor-only'" ref="previewPaneEl" class="md-pane md-pane-preview" :style="previewPaneStyle">
            <div
              ref="previewEl"
              class="md-preview luogu-md"
              :class="{ 'typora-mode': viewMode === 'typora' }"
              @scroll="onPreviewScroll"
              @click.capture="onPreviewClickCapture"
              @toggle.capture="onPreviewToggle"
            ></div>
          </section>
        </div>

        <!-- 状态栏 -->
        <div class="md-statusbar">
          <span class="md-stats">{{ statsText }}</span>
          <span class="md-status-right" :class="dirty ? 'is-dirty' : 'is-clean'">{{ dirty ? '未保存' : '已保存' }}</span>
        </div>
      </div>
    </div>

    <!-- ===== 弹窗：链接 / 图片 / 代码块 / 表格 / 折叠框 / 引言 / B站 / 公式面板 ===== -->
    <div v-if="linkVisible" class="mdm-overlay" @click.self="linkVisible = false">
      <div class="mdm-dialog">
        <div class="mdm-header"><span>插入链接</span><button class="mdm-close" @click="linkVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <label class="mdm-field"><span>链接标题</span><input v-model="linkText" placeholder="例如：帮助文档" /></label>
          <label class="mdm-field"><span>链接 URL</span><input v-model="linkUrl" placeholder="https://" /></label>
        </div>
        <div class="mdm-footer">
          <button class="mdm-btn" @click="linkVisible = false">取消</button>
          <button class="mdm-btn mdm-btn-primary" @click="confirmLink">插入</button>
        </div>
      </div>
    </div>

    <div v-if="imageVisible" class="mdm-overlay" @click.self="imageVisible = false">
      <div class="mdm-dialog">
        <div class="mdm-header"><span>插入图片</span><button class="mdm-close" @click="imageVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <label class="mdm-field"><span>图片描述 (Alt)</span><input v-model="imageAlt" placeholder="例如：架构示意图" /></label>
          <label class="mdm-field"><span>图片 URL</span><input v-model="imageUrl" placeholder="https://" /></label>
        </div>
        <div class="mdm-footer">
          <button class="mdm-btn" @click="imageVisible = false">取消</button>
          <button class="mdm-btn mdm-btn-primary" @click="confirmImage">插入</button>
        </div>
      </div>
    </div>

    <div v-if="codeVisible" class="mdm-overlay" @click.self="codeVisible = false">
      <div class="mdm-dialog">
        <div class="mdm-header"><span>插入代码块</span><button class="mdm-close" @click="codeVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <label class="mdm-field"><span>编程语言</span>
            <select v-model="codeLang">
              <option v-for="l in CODE_LANGS" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
          <label class="mdm-field mdm-check"><input type="checkbox" v-model="codeLineNumbers" /><span>显示行号</span></label>
          <label class="mdm-field"><span>高亮行（可选，如 5-6 或 3,5,8-10）</span><input v-model="codeLines" placeholder="例如：5-6" /></label>
        </div>
        <div class="mdm-footer">
          <button class="mdm-btn" @click="codeVisible = false">取消</button>
          <button class="mdm-btn mdm-btn-primary" @click="confirmCode">插入</button>
        </div>
      </div>
    </div>

    <div v-if="tableVisible" class="mdm-overlay" @click.self="tableVisible = false">
      <div class="mdm-dialog">
        <div class="mdm-header"><span>表格生成器</span><button class="mdm-close" @click="tableVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <div class="mdm-table-actions">
            <button class="mdm-btn" @click="addTableRow"><i class="fas fa-plus"></i> 一行</button>
            <button class="mdm-btn" @click="addTableCol"><i class="fas fa-plus"></i> 一列</button>
            <label class="mdm-check"><input type="checkbox" v-model="tableTuack" /><span>Tuack 竞赛风格</span></label>
          </div>
          <p class="mdm-hint">单元格填 <code>^</code> 向上合并、<code>&lt;</code> 向左合并。</p>
          <div class="mdm-table-wrap">
            <table class="mdm-grid">
              <tr v-for="(row, r) in tableGrid" :key="r">
                <th v-for="(cell, c) in row" v-if="r === 0" :key="'h' + c">
                  <input v-model="cell.text" />
                </th>
                <td v-for="(cell, c) in row" v-if="r > 0" :key="c">
                  <input v-model="cell.text" />
                  <span class="mdm-merge">
                    <button type="button" title="向上合并" @click="cell.text = '^'">^</button>
                    <button type="button" title="向左合并" @click="cell.text = '<'">&lt;</button>
                  </span>
                </td>
              </tr>
            </table>
          </div>
        </div>
        <div class="mdm-footer">
          <button class="mdm-btn" @click="tableVisible = false">取消</button>
          <button class="mdm-btn mdm-btn-primary" @click="confirmTable">生成并插入</button>
        </div>
      </div>
    </div>

    <div v-if="calloutVisible" class="mdm-overlay" @click.self="calloutVisible = false">
      <div class="mdm-dialog">
        <div class="mdm-header"><span>插入折叠框</span><button class="mdm-close" @click="calloutVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <label class="mdm-field"><span>类型</span>
            <select v-model="calloutType">
              <option value="info">info 提示</option>
              <option value="success">success 成功</option>
              <option value="warning">warning 警告</option>
              <option value="error">error 错误</option>
            </select>
          </label>
          <label class="mdm-field"><span>标题（支持 LaTeX，如 $\mathcal{O}(n\log n)$）</span><input v-model="calloutTitle" placeholder="折叠框标题" /></label>
          <label class="mdm-check"><input type="checkbox" v-model="calloutOpen" /><span>默认展开</span></label>
        </div>
        <div class="mdm-footer">
          <button class="mdm-btn" @click="calloutVisible = false">取消</button>
          <button class="mdm-btn mdm-btn-primary" @click="confirmCallout">插入</button>
        </div>
      </div>
    </div>

    <div v-if="epigraphVisible" class="mdm-overlay" @click.self="epigraphVisible = false">
      <div class="mdm-dialog">
        <div class="mdm-header"><span>插入引言</span><button class="mdm-close" @click="epigraphVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <label class="mdm-field"><span>落款 / 作者</span><input v-model="epigraphAuthor" placeholder="例如：高德纳" /></label>
          <label class="mdm-field"><span>引言内容</span><textarea v-model="epigraphContent" rows="3" placeholder="过早的优化是万恶之源。"></textarea></label>
        </div>
        <div class="mdm-footer">
          <button class="mdm-btn" @click="epigraphVisible = false">取消</button>
          <button class="mdm-btn mdm-btn-primary" @click="confirmEpigraph">插入</button>
        </div>
      </div>
    </div>

    <div v-if="bilibiliVisible" class="mdm-overlay" @click.self="bilibiliVisible = false">
      <div class="mdm-dialog">
        <div class="mdm-header"><span>插入 Bilibili 视频</span><button class="mdm-close" @click="bilibiliVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <label class="mdm-field"><span>BV 号 / AV 号</span><input v-model="bilibiliId" placeholder="例如：BV1GJ411x7h7 或 av53851218" /></label>
          <p class="mdm-hint">支持带参数的链接，如 BV1bv411p7U5?page=4&amp;t=82</p>
        </div>
        <div class="mdm-footer">
          <button class="mdm-btn" @click="bilibiliVisible = false">取消</button>
          <button class="mdm-btn mdm-btn-primary" @click="confirmBilibili">插入</button>
        </div>
      </div>
    </div>

    <div v-if="mathVisible" class="mdm-overlay mdm-overlay-wide" @click.self="mathVisible = false">
      <div class="mdm-dialog mdm-dialog-wide">
        <div class="mdm-header"><span>数学公式面板</span><button class="mdm-close" @click="mathVisible = false"><i class="fas fa-times"></i></button></div>
        <div class="mdm-body">
          <div class="mdm-math-tabs">
            <button
              v-for="(cat, idx) in mathLibrary" :key="idx"
              class="mdm-math-tab" :class="{ active: mathActiveTab === idx }"
              @click="switchMathTab(idx)"
            >{{ cat.category }}</button>
          </div>
          <div class="mdm-math-grid" :class="{ wide: mathItems.some((it) => it.wide) }">
            <button
              v-for="(item, i) in mathItems" :key="i"
              class="mdm-math-card" :class="{ wide: item.wide }"
              :title="item.desc || item.label" @click="insertMathSymbol(item.code)"
            >
              <span class="mdm-math-preview" v-html="item.html"></span>
              <span class="mdm-math-label">{{ item.label }}</span>
            </button>
          </div>
        </div>
        <div class="mdm-footer">
          <span class="mdm-hint">点击任意公式插入光标处</span>
          <button class="mdm-btn" @click="mathVisible = false">关闭</button>
        </div>
      </div>
    </div>

    <SaveConfirmModal
      v-model:visible="saveConfirmVisible"
      title="未保存的文档"
      message="当前 Markdown 内容尚未保存，是否保存后再离开？"
      @save="onSaveThenLeave"
      @discard="leaveNow"
    />
  </div>
</template>

<script setup>
/**
 * 「工具 → Markdown」—— 7fa4-chat 自有外壳（Vue + 主题变量 CSS 全部自绘）。
 *
 * JS 逻辑移植自上游 wudream813/luogu-markdown-editor v1.23.1（MIT）editor.js：
 *   - 滚动同步（rAF 合并 + 回声检测 + [data-src-line] 行锚点插值）→ markdown/scroll-sync.js
 *   - 撤销/重做（快照 + diff 光标定位）、按键捷径、列表续行、Tab 缩进
 *   - 预览补丁（顶层子节点 diff，保住已加载的 B 站 iframe 不被键盘输入重置）
 *   - 尾部 padding 对齐、行号 gutter（镜像 div 还原软换行）、折叠框开合记忆
 * 界面（标题栏/工具栏/分屏/状态栏/弹窗）为本项目原创，配色全部走应用主题变量，
 * 21 套主题（含暗色）自动生效。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import SaveConfirmModal from '../components/SaveConfirmModal.vue'
import { katex, Prism, LuoguMathLibrary, createTyporaHost, setTaskToggleHandler } from '../markdown/index.js'
import { LuoguParser } from '../markdown/vendor/index.js'
import { renderDocument } from '../markdown/index.js'
import { createScrollSync } from '../markdown/scroll-sync.js'
import { useNarrow } from '../composables/useNarrow.js'
import './ide/ide-tool.css'
import './markdown-tool.css'

const emit = defineEmits(['back', 'dirty-change'])
const { isNarrow } = useNarrow()

// ===== 解析器（与消息气泡同引擎，独立实例，不做 QQ 表情替换 / id 前缀改写） =====
// 不用 renderDocument() 做预览：它的输出带 rN- 前缀的动态 id，每次渲染都变，
// 会击穿下方 patchPreview 的节点 diff（B 站 iframe 每敲一个字都被重置）。
if (Prism && 'manual' in Prism) Prism.manual = true
const parser = new LuoguParser({ katex, prism: Prism })

// ===== 元素引用 =====
const editorRootEl = ref(null)
const workspaceEl = ref(null)
const editorPaneEl = ref(null)
const previewPaneEl = ref(null)
const taEl = ref(null)
const previewEl = ref(null)
const gutterEl = ref(null)

// ===== 文档内容 / 未保存标记 =====
const content = ref('')
const fileName = ref('')
const saving = ref(false)
const exporting = ref(false)
const saveConfirmVisible = ref(false)
const savedContent = ref('')
const savedKey = ref('')
const dirty = computed(() => content.value !== savedContent.value)
watch(dirty, (v) => emit('dirty-change', v))

function onBack() {
  if (dirty.value) { saveConfirmVisible.value = true; return }
  emit('back')
}
async function onSaveThenLeave() {
  saveConfirmVisible.value = false
  await save()
  if (!dirty.value) emit('back')
}
function leaveNow() {
  saveConfirmVisible.value = false
  emit('back')
}

// ===== 滚动同步引擎（上游算法，见 scroll-sync.js） =====
const scrollSyncOn = ref(localStorage.getItem('md_tool_scroll_sync') !== '0')
const syncEngine = createScrollSync({
  getTextarea: () => taEl.value,
  getPreview: () => previewEl.value,
  getGutter: () => gutterEl.value,
})

function onEditorScroll() {
  const ta = taEl.value
  if (!ta) return
  // gutter 必须跟随包括我们自己的写入在内的所有滚动，先于回声判断更新
  syncEngine.updateGutterScroll()
  if (syncEngine.isEchoScroll(ta)) return
  syncEngine.sync('editor')
}
function onPreviewScroll() {
  const pv = previewEl.value
  if (!pv) return
  if (syncEngine.isEchoScroll(pv)) return
  syncEngine.sync('preview')
}
function toggleScrollSync(force) {
  const next = force === undefined ? !scrollSyncOn.value : !!force
  scrollSyncOn.value = next
  localStorage.setItem('md_tool_scroll_sync', next ? '1' : '0')
  syncEngine.setEnabled(next)
}

// ===== 渲染管线（上游 render() 移植） =====
// 折叠框开合记忆：键为源码行号，改名/改类型后仍然有效
const calloutToggles = new Map()

// 已点开过的 B 站视频：预览容器被 diff 重建后自动恢复播放态，不用再点一次
const loadedBiliSrcs = new Set()

let renderTimer = null
let lastTypingAt = 0

function renderDelay() {
  const len = content.value.length
  if (len > 200000) return 400
  if (len > 50000) return 250
  return 120
}
function scheduleRender(immediate) {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(renderNow, immediate ? 0 : renderDelay())
}
function onInput() {
  lastTypingAt = Date.now()
  scheduleRender(false)
}
watch(content, () => {
  // 打字路径已在 onInput 里排程；程序化修改（插入/撤销/Typora 提交）立即渲染
  scheduleRender(Date.now() - lastTypingAt >= 80)
})

/**
 * 上游 patchPreview() 移植：预览顶层子节点按内容做 diff，未变化的节点原位保留。
 * 纯 innerHTML 替换会把正在播放的 B 站 <iframe> 一起销毁（iframe 一旦脱离文档就
 * 必然重载），导致"打字 anywhere 视频回到待点击封面"。
 */
function patchPreview(parent, html) {
  const tpl = document.createElement('template')
  tpl.innerHTML = html

  const keyOf = (n) => {
    if (n.nodeType === 3) return `t:${n.data}`
    if (n.nodeType !== 1) return `o:${n.nodeName}`
    if (n.classList && n.classList.contains('luogu-bilibili-container')) {
      const holder = n.querySelector('[data-src]')
      if (holder) return `b:${holder.getAttribute('data-src')}`
    }
    return `h:${n.outerHTML}`
  }

  const oldNodes = Array.from(parent.childNodes)
  const newNodes = Array.from(tpl.content.childNodes)
  const oldKeys = oldNodes.map(keyOf)
  const newKeys = newNodes.map(keyOf)

  const drop = (n) => {
    if (n && n.parentNode === parent) {
      try { parent.removeChild(n) } catch { /* 已脱离 */ }
    }
  }

  let oi = 0
  const WINDOW = 64 // 有界前视保持线性；再远的匹配当作未命中整段重建
  for (let ni = 0; ni < newNodes.length; ni++) {
    let found = -1
    for (let k = oi; k < oldNodes.length && k < oi + WINDOW; k++) {
      if (oldKeys[k] === newKeys[ni]) { found = k; break }
    }
    if (found === -1) {
      let ref = null
      for (let k = oi; k < oldNodes.length; k++) {
        if (oldNodes[k].parentNode === parent) { ref = oldNodes[k]; break }
      }
      parent.insertBefore(newNodes[ni], ref)
    } else {
      for (let k = oi; k < found; k++) drop(oldNodes[k])
      oi = found + 1
    }
  }
  for (let k = oi; k < oldNodes.length; k++) drop(oldNodes[k])

  // 容器自身 markup 变过而重建的视频，回到封面态；若用户已点过播放则自动恢复
  parent.querySelectorAll('button.luogu-bilibili-facade[data-src]').forEach((btn) => {
    if (loadedBiliSrcs.has(btn.getAttribute('data-src')) && window.loadBilibiliPlayer) {
      window.loadBilibiliPlayer(btn)
    }
  })
}

function renderNow() {
  const ta = taEl.value
  const pv = previewEl.value
  if (!ta || !pv) return

  syncEngine.invalidate()
  const html = parser ? parser.render(ta.value) : ''
  patchPreview(pv, html)

  // 恢复读者手动开合过的折叠框（只覆盖动过的，源码里 {open} 的改动仍然生效）
  if (calloutToggles.size) {
    pv.querySelectorAll('details.luogu-callout').forEach((d) => {
      const key = d.getAttribute('data-src-line')
      if (key === null || !calloutToggles.has(key)) return
      if (calloutToggles.get(key)) d.setAttribute('open', '')
      else d.removeAttribute('open')
    })
  }

  syncEngine.syncEditorTailPadding()
  syncEngine.updateGutter()
}

// 预览交互：点开的 B 站封面记入已播放集合；<details> 开合记入折叠框记忆
function onPreviewClickCapture(e) {
  const btn = e.target && e.target.closest ? e.target.closest('.luogu-bilibili-facade[data-src]') : null
  if (btn) loadedBiliSrcs.add(btn.getAttribute('data-src'))
}
function onPreviewToggle(e) {
  const d = e.target
  if (!d || !d.classList || !d.classList.contains('luogu-callout')) return
  const key = d.getAttribute('data-src-line')
  if (key === null) return
  calloutToggles.set(key, d.open)
  syncEngine.invalidate()
}

/**
 * 预览任务勾选 → 精确回写源码（上游 toggleTask 移植）。
 * 按第 N 个任务项定位源码行改 [ ]/[x]，不做整篇重渲染——重建 DOM 会把
 * 用户正在点的勾选框从指针底下抽走。
 */
function toggleTask(checkbox) {
  const taskIndexAttr = checkbox.getAttribute('data-task-index')
  const ta = taEl.value
  if (taskIndexAttr === null || taskIndexAttr === undefined || !ta) return
  const targetIdx = parseInt(taskIndexAttr, 10)
  const isChecked = checkbox.checked
  const val = ta.value

  let curTaskIdx = 0
  const lines = val.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*(?:[*+-]|\d+\.)\s+)\[([ xX])\](\s*.*)$/)
    if (match) {
      if (curTaskIdx === targetIdx) {
        lines[i] = `${match[1]}[${isChecked ? 'x' : ' '}]${match[3]}`
        break
      }
      curTaskIdx++
    }
  }
  ta.value = lines.join('\n')
  content.value = ta.value
  pushHistory()
}

// 软换行 / 预览回流都会改变几何而无需重渲染，用 ResizeObserver 显式失效缓存
let resizeObs = null
let previewResizeObs = null

// ===== 撤销 / 重做（上游 pushHistory / applyHistoryEntry 移植） =====
// 快照记录光标位置；恢复时光标定位到两个版本的第一个差异处，而不是快照时的位置
const undoStack = ref([])
const redoStack = ref([])
const MAX_HISTORY = 100
const canUndo = computed(() => undoStack.value.length > 1)
const canRedo = computed(() => redoStack.value.length > 0)

function pushHistory() {
  const ta = taEl.value
  if (!ta) return
  const val = ta.value
  const top = undoStack.value[undoStack.value.length - 1]
  if (!top || top.value !== val) {
    undoStack.value.push({ value: val, selectionStart: ta.selectionStart, selectionEnd: ta.selectionEnd })
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
  }
}
function diffCaret(from, to) {
  const max = Math.min(from.length, to.length)
  let i = 0
  while (i < max && from.charCodeAt(i) === to.charCodeAt(i)) i++
  return i
}
function applyHistoryEntry(entry) {
  const ta = taEl.value
  if (!ta) return
  const previous = ta.value
  ta.value = entry.value
  const pos = previous === entry.value
    ? Math.min(entry.selectionStart ?? entry.value.length, entry.value.length)
    : Math.min(diffCaret(previous, entry.value), entry.value.length)
  ta.setSelectionRange(pos, pos)
  ta.focus()
  scrollCaretIntoView()
  content.value = entry.value
  scheduleRender(true)
}
function scrollCaretIntoView() {
  const ta = taEl.value
  if (!ta) return
  const before = ta.value.slice(0, ta.selectionStart)
  const line = before.split('\n').length - 1
  const style = window.getComputedStyle(ta)
  const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.5) || 20
  const target = line * lineHeight
  if (target < ta.scrollTop || target > ta.scrollTop + ta.clientHeight - lineHeight) {
    ta.scrollTop = Math.max(0, target - ta.clientHeight / 2)
  }
}
function undo() {
  if (undoStack.value.length > 1) {
    const cur = undoStack.value.pop()
    // 记住当前光标，让重做能原样恢复
    redoStack.value.push({ value: cur.value, selectionStart: taEl.value.selectionStart, selectionEnd: taEl.value.selectionEnd })
    applyHistoryEntry(undoStack.value[undoStack.value.length - 1])
  }
}
function redo() {
  if (redoStack.value.length > 0) {
    const next = redoStack.value.pop()
    undoStack.value.push(next)
    applyHistoryEntry(next)
  }
}

// ===== 内容写入辅助 =====
/** 程序化改文本：写 textarea、同步 content、推历史、立即渲染 */
function applyText(v, selStart = null, selEnd = null) {
  const ta = taEl.value
  if (ta) {
    ta.value = v
    if (selStart != null) ta.setSelectionRange(selStart, selEnd ?? selStart)
  }
  content.value = v
  pushHistory()
  scheduleRender(true)
}

// ===== 插入动作（上游 wrapSelection / insertAtCursor 系列移植） =====
function wrapSelection(prefix, suffix, defaultText = '') {
  const ta = taEl.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const val = ta.value
  const selected = val.substring(start, end) || defaultText
  ta.value = val.substring(0, start) + prefix + selected + suffix + val.substring(end)
  ta.focus()
  ta.selectionStart = start + prefix.length
  ta.selectionEnd = start + prefix.length + selected.length
  content.value = ta.value
  pushHistory()
  scheduleRender(true)
}
function insertAtCursor(text) {
  const ta = taEl.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const val = ta.value
  ta.value = val.substring(0, start) + text + val.substring(end)
  ta.focus()
  ta.selectionStart = ta.selectionEnd = start + text.length
  content.value = ta.value
  pushHistory()
  scheduleRender(true)
}
const insertBold = () => wrapSelection('**', '**', '加粗文本')
const insertItalic = () => wrapSelection('*', '*', '斜体文本')
const insertStrikethrough = () => wrapSelection('~~', '~~', '删除线文本')
const insertInlineCode = () => wrapSelection('`', '`', 'code')
const insertQuote = () => wrapSelection('\n> ', '\n', '引用内容')
const insertHR = () => insertAtCursor('\n\n---\n\n')
const insertMathInline = () => wrapSelection('$', '$', 'x')
const insertMathBlock = () => insertAtCursor('\n\n$$\n\\sum_{i=1}^n a_i = S_n\n$$\n\n')
const insertHeading = (level) => wrapSelection(`\n${'#'.repeat(level)} `, '\n', `标题 ${level}`)
const insertTaskList = () => insertAtCursor('\n- [ ] 未完成任务项\n- [x] 已完成任务项\n')
const insertUnorderedList = () => insertAtCursor('\n- 列表项一\n- 列表项二\n- 列表项三\n')
const insertOrderedList = () => insertAtCursor('\n1. 列表项一\n2. 列表项二\n3. 列表项三\n')
const insertCallout = (type, title, isOpen) =>
  insertAtCursor(`\n\n::::${type}${title ? `[${title}]` : ''}${isOpen ? '{open}' : ''}\n这里是${type}折叠框的内容。\n::::\n\n`)
const insertEpigraph = (author, text) =>
  insertAtCursor(`\n\n:::epigraph${author ? `[——${author}]` : ''}\n${text || '千里之行，始于足下。'}\n:::\n\n`)
const insertBilibili = (id) => { if (id) insertAtCursor(`\n\n![](bilibili:${id})\n\n`) }

/**
 * 提升（delta<0）/降低（delta>0）光标所在行的标题级别。非标题行升级为 h1；
 * h6 再降级会摘掉 # 回归段落。级别钳制在 0..6，不回绕。
 */
function shiftHeadingLevel(delta) {
  const ta = taEl.value
  if (!ta) return
  const val = ta.value
  const caret = ta.selectionStart
  const lineStart = val.lastIndexOf('\n', caret - 1) + 1
  let lineEnd = val.indexOf('\n', caret)
  if (lineEnd === -1) lineEnd = val.length
  const line = val.slice(lineStart, lineEnd)

  const m = line.match(/^(#{1,6})\s+(.*)$/)
  const current = m ? m[1].length : 0
  const text = m ? m[2] : line.trim()
  if (!text) return

  let next
  if (current === 0) next = delta < 0 ? 1 : 0
  else {
    next = current + delta
    if (next < 0) next = 0
    if (next > 6) next = 6
  }
  if (next === current) return

  const replacement = next === 0 ? text : '#'.repeat(next) + ' ' + text
  ta.value = val.slice(0, lineStart) + replacement + val.slice(lineEnd)
  // 光标保持在文本内同一偏移而非行首，# 长度变化时不会漂移
  const pos = Math.max(lineStart, caret + (replacement.length - line.length))
  ta.selectionStart = ta.selectionEnd = pos
  content.value = ta.value
  pushHistory()
  scheduleRender(true)
}

// ===== 键盘（上游 handleKeyDown 移植，Ctrl+S 由宿主捕获阶段接管） =====
function onKeydown(e) {
  const isCtrl = e.ctrlKey || e.metaKey
  if (isCtrl) {
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); Promise.resolve(save()).catch(() => {}); return }
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); insertBold(); return }
    if ((e.key === 'i' || e.key === 'I') && !e.shiftKey) { e.preventDefault(); insertItalic(); return }
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault()
      if (e.shiftKey) insertMathInline(); else linkVisible.value = true
      return
    }
    if ((e.key === 'd' || e.key === 'D') && !e.shiftKey) { e.preventDefault(); insertStrikethrough(); return }
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault()
      if (e.shiftKey) insertMathBlock(); else mathVisible.value = true
      return
    }
    if (e.shiftKey && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); insertHR(); return }
    if (e.shiftKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); linkVisible.value = true; return }
    if (e.shiftKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); imageVisible.value = true; return }
    if (e.shiftKey && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); insertQuote(); return }
    // Shift+数字键时 e.key 不可靠（很多布局报 "!"），按物理键 e.code 匹配
    if (e.shiftKey && /^Digit[12789]$/.test(e.code || '')) {
      const action = {
        Digit1: () => { codeVisible.value = true },
        Digit2: () => openTableBuilder(3, 4),
        Digit7: insertUnorderedList,
        Digit8: insertOrderedList,
        Digit9: insertTaskList,
      }[e.code]
      if (action) { e.preventDefault(); action(); return }
    }
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      shiftHeadingLevel(e.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
    if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redo(); return }
  }

  // 列表内回车自动续行；IME 组合中的回车是确认候选词，不能劫持
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229
      && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const ta = taEl.value
    const start = ta.selectionStart
    const end = ta.selectionEnd
    if (start === end) {
      const val = ta.value
      const lineStart = val.lastIndexOf('\n', start - 1) + 1
      const line = val.slice(lineStart, start)
      // 缩进  标记          复选框            内容
      const m = line.match(/^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(?:\[([ xX])\]\s+)?(.*)$/)
      if (m) {
        const [, indent, bullet, num, delim, gap, box, text] = m
        if (text.trim() === '' && box === undefined) {
          // 空列表项上回车 = 结束列表
          e.preventDefault()
          ta.value = val.slice(0, lineStart) + val.slice(start)
          ta.selectionStart = ta.selectionEnd = lineStart
          content.value = ta.value
          pushHistory(); scheduleRender(true)
          return
        }
        let marker
        if (bullet) marker = bullet + gap
        else marker = (parseInt(num, 10) + 1) + delim + gap
        if (box !== undefined) {
          if (text.trim() === '') {
            e.preventDefault()
            const bare = indent + (bullet ? bullet + gap : num + delim + gap)
            ta.value = val.slice(0, lineStart) + bare + val.slice(start)
            ta.selectionStart = ta.selectionEnd = lineStart + bare.length
            content.value = ta.value
            pushHistory(); scheduleRender(true)
            return
          }
          marker += '[ ] '
        }
        e.preventDefault()
        const insert = '\n' + indent + marker
        ta.value = val.slice(0, start) + insert + val.slice(end)
        ta.selectionStart = ta.selectionEnd = start + insert.length
        content.value = ta.value
        pushHistory(); scheduleRender(true)
        return
      }
    }
  }

  // Tab 缩进 / Shift+Tab 反缩进
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = taEl.value
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = ta.value
    if (e.shiftKey) {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1
      if (val.substring(lineStart, lineStart + 4) === '    ') {
        ta.value = val.substring(0, lineStart) + val.substring(lineStart + 4)
        ta.selectionStart = Math.max(lineStart, start - 4)
        ta.selectionEnd = Math.max(lineStart, end - 4)
      } else if (val.substring(lineStart, lineStart + 2) === '  ') {
        ta.value = val.substring(0, lineStart) + val.substring(lineStart + 2)
        ta.selectionStart = Math.max(lineStart, start - 2)
        ta.selectionEnd = Math.max(lineStart, end - 2)
      }
    } else {
      ta.value = val.substring(0, start) + '    ' + val.substring(end)
      ta.selectionStart = ta.selectionEnd = start + 4
    }
    content.value = ta.value
    // 缩进是真实编辑，必须可撤销
    pushHistory()
    scheduleRender(true)
  }
}

// ===== 视图模式 / Typora =====
const viewMode = ref('split')
let typoraHost = null

watch(viewMode, (mode, prev) => {
  // 离开 Typora 模式必须提交仍在编辑的块，否则面板隐藏时改动被丢弃
  if (prev === 'typora' && mode !== 'typora' && typoraHost) typoraHost.disable()
  if (mode === 'typora' && typoraHost) typoraHost.enable()
  nextTick(() => {
    syncEngine.invalidate()
    syncEngine.syncEditorTailPadding()
  })
})
function setViewMode(mode) {
  viewMode.value = mode
}

// ===== 分隔条拖拽（上游 initSplitter 移植：Pointer Events + 指针捕获） =====
const editorPct = ref(50)
const editorPaneStyle = computed(() => ({
  flex: viewMode.value === 'split' ? `0 0 ${editorPct.value}%` : '1 1 auto',
}))
const previewPaneStyle = computed(() => ({
  flex: viewMode.value === 'split' ? `0 0 ${100 - editorPct.value}%` : '1 1 auto',
}))
const MIN_PANE_WIDTH = 200

function applySplit(clientX) {
  const ws = workspaceEl.value
  if (!ws) return
  const rect = ws.getBoundingClientRect()
  const offsetX = clientX - rect.left
  if (offsetX > MIN_PANE_WIDTH && (rect.width - offsetX) > MIN_PANE_WIDTH) {
    editorPct.value = (offsetX / rect.width) * 100
  }
}
function onSplitPointerDown(e) {
  const handle = e.currentTarget
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  try { handle.setPointerCapture(e.pointerId) } catch { /* 捕获不支持也能拖 */ }
  const onMove = (ev) => applySplit(ev.clientX)
  const onUp = () => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  e.preventDefault()
}

// ===== 状态栏统计 =====
const statsText = computed(() => {
  const text = content.value
  const chars = text.length
  const words = (text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_]+/g) || []).length
  const lines = text.split('\n').length
  const formulas = (text.match(/\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$/g) || []).length
  return `${lines} 行 · ${words} 字 · ${chars} 字符 · ${formulas} 公式`
})

// ===== 弹窗状态 =====
const linkVisible = ref(false)
const linkText = ref('')
const linkUrl = ref('')
function confirmLink() {
  const text = linkText.value.trim() || '链接'
  const url = linkUrl.value.trim() || 'https://'
  insertAtCursor(`[${text}](${url})`)
  linkVisible.value = false
  linkText.value = ''; linkUrl.value = ''
}

const imageVisible = ref(false)
const imageAlt = ref('')
const imageUrl = ref('')
function confirmImage() {
  const alt = imageAlt.value.trim() || '图片'
  const url = imageUrl.value.trim()
  if (!url) return
  insertAtCursor(`![${alt}](${url})`)
  imageVisible.value = false
  imageAlt.value = ''; imageUrl.value = ''
}

const CODE_LANGS = ['cpp', 'c', 'python', 'java', 'pascal', 'rust', 'go', 'plain']
const codeVisible = ref(false)
const codeLang = ref('cpp')
const codeLineNumbers = ref(true)
const codeLines = ref('')
function confirmCode() {
  let args = codeLang.value
  if (codeLineNumbers.value) args += ' line-numbers'
  const lines = codeLines.value.trim()
  if (lines) args += ` lines=${lines}`
  insertAtCursor(`\n\n\`\`\`${args}\n// 在此编写代码\n\`\`\`\n\n`)
  codeVisible.value = false
  codeLines.value = ''
}

const tableVisible = ref(false)
const tableTuack = ref(false)
const tableGrid = ref([])
function openTableBuilder(rows = 3, cols = 4) {
  const grid = []
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) row.push({ text: r === 0 ? `标题 ${c + 1}` : `数据 ${r},${c + 1}` })
    grid.push(row)
  }
  tableGrid.value = grid
  tableVisible.value = true
}
function addTableRow() {
  const cols = tableGrid.value[0] ? tableGrid.value[0].length : 3
  const r = tableGrid.value.length
  const row = []
  for (let c = 0; c < cols; c++) row.push({ text: `数据 ${r},${c + 1}` })
  tableGrid.value.push(row)
}
function addTableCol() {
  const c = tableGrid.value[0] ? tableGrid.value[0].length : 0
  for (let r = 0; r < tableGrid.value.length; r++) {
    tableGrid.value[r].push({ text: r === 0 ? `标题 ${c + 1}` : `数据 ${r},${c + 1}` })
  }
}
function confirmTable() {
  const grid = tableGrid.value
  if (!grid.length) return
  let md = ''
  if (tableTuack.value) md += '::cute-table{tuack}\n\n'
  const header = grid[0]
  md += '| ' + header.map((cell) => cell.text || ' ').join(' | ') + ' |\n'
  md += '| ' + header.map(() => ':-:').join(' | ') + ' |\n'
  for (let r = 1; r < grid.length; r++) {
    md += '| ' + grid[r].map((cell) => cell.text || ' ').join(' | ') + ' |\n'
  }
  insertAtCursor('\n\n' + md + '\n')
  tableVisible.value = false
}

const calloutVisible = ref(false)
const calloutType = ref('info')
const calloutTitle = ref('')
const calloutOpen = ref(false)
function confirmCallout() {
  insertCallout(calloutType.value, calloutTitle.value.trim(), calloutOpen.value)
  calloutVisible.value = false
  calloutTitle.value = ''
}

const epigraphVisible = ref(false)
const epigraphAuthor = ref('')
const epigraphContent = ref('')
function confirmEpigraph() {
  insertEpigraph(epigraphAuthor.value.trim(), epigraphContent.value.trim())
  epigraphVisible.value = false
  epigraphAuthor.value = ''; epigraphContent.value = ''
}

const bilibiliVisible = ref(false)
const bilibiliId = ref('')
function confirmBilibili() {
  const id = bilibiliId.value.trim()
  if (!id) return
  insertBilibili(id)
  bilibiliVisible.value = false
  bilibiliId.value = ''
}

// ===== 数学公式面板（数据来自 vendor LuoguMathLibrary，KaTeX 只在构建面板时渲染一次） =====
const mathVisible = ref(false)
const mathActiveTab = ref(0)
const mathPanels = {}
const mathLibrary = LuoguMathLibrary || []
const mathItems = computed(() => {
  const cat = mathLibrary[mathActiveTab.value]
  if (!cat) return []
  if (!mathPanels[mathActiveTab.value]) {
    const opts = { throwOnError: false, displayMode: false, output: 'html' }
    mathPanels[mathActiveTab.value] = cat.items.map((item) => {
      let html = ''
      try {
        const clean = String(item.code).replace(/^\$\$\n?|\n?\$\$$|^\$|\$$/g, '')
        html = katex.renderToString(clean, opts)
      } catch { html = '' }
      return { code: item.code, label: item.label || '', desc: item.desc || '', wide: !!item.isWide, html }
    })
  }
  return mathPanels[mathActiveTab.value]
})
function switchMathTab(idx) { mathActiveTab.value = idx }
function openMathPanel() { mathVisible.value = true }
function insertMathSymbol(code) {
  insertAtCursor(code)
  mathVisible.value = false
}

// ===== 文件操作（工作区） =====
const editingName = ref(false)
const fileNameDraft = ref('')
const nameInputRef = ref(null)

function startEditName() {
  fileNameDraft.value = fileName.value
  editingName.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}
function commitName() {
  if (!editingName.value) return
  editingName.value = false
  const name = fileNameDraft.value.trim()
  if (name) fileName.value = name
}
function cancelName() { editingName.value = false }

/** 外部整体替换文档：清折叠框记忆、重置历史栈、立即渲染 */
function loadDocument(text) {
  calloutToggles.clear()
  undoStack.value = []
  redoStack.value = []
  content.value = text
  nextTick(() => {
    pushHistory()
    scheduleRender(true)
  })
}

async function openFile() {
  const r = await window.api.selectFile()
  if (!r.success || !r.data) return
  try {
    const binary = atob(r.data)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const text = new TextDecoder('utf-8').decode(bytes)
    fileName.value = r.name
    savedKey.value = r.name
    savedContent.value = text
    await window.api.saveDataFile(r.name, text)
    loadDocument(text)
  } catch (e) {
    alert('读取文件失败：' + e.message)
  }
}

async function workspaceExists(name) {
  try {
    const r = await window.api.loadDataFile(name)
    return !!(r && r.success)
  } catch { return false }
}
async function removeWorkspaceFile(name) {
  try { await window.api.deleteDataFile?.(name) } catch {}
}

async function newFile() {
  if (content.value.trim() && !confirm('当前内容未保存，确定新建并丢弃？')) return
  fileName.value = ''
  savedKey.value = ''
  savedContent.value = ''
  loadDocument('')
}

async function save() {
  if (saving.value) return
  const name = (fileName.value && fileName.value.trim()) || '未命名.md'
  const prevKey = savedKey.value
  const renamed = prevKey && prevKey !== name
  if (prevKey !== name) {
    const exists = await workspaceExists(name)
    if (exists && !renamed) {
      if (!confirm(`工作区已存在 ${name}，确定覆盖？`)) return
    } else if (exists && renamed) {
      if (!confirm(`工作区已存在 ${name}，确定覆盖（原 ${prevKey} 将被删除）？`)) return
    }
  }
  saving.value = true
  try {
    const r = await window.api.saveDataFile(name, content.value)
    if (!r || !r.success) return
    if (renamed) await removeWorkspaceFile(prevKey)
    fileName.value = name
    savedKey.value = name
    savedContent.value = content.value
  } catch (e) {
    console.error('save failed:', e)
  } finally {
    saving.value = false
  }
}

async function exportPng() {
  if (exporting.value) return
  if (!content.value.trim()) return
  exporting.value = true
  try {
    await window.api.exportMarkdownPng(fileName.value || '未命名.md', renderDocument(content.value))
  } catch (e) {
    console.error('export failed:', e)
  }
  exporting.value = false
}

// 拖放打开本地文档（仅文本类扩展名，图片等二进制直接拒绝）
const TEXT_EXT = /\.(md|markdown|txt|text)$/i
function onDropFile(e) {
  const files = e.dataTransfer && e.dataTransfer.files
  if (!files || files.length === 0) return
  const file = files[0]
  if (!TEXT_EXT.test(file.name)) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result || '')
    fileName.value = file.name
    savedContent.value = text
    loadDocument(text)
  }
  reader.readAsText(file, 'utf-8')
}

// ===== 挂载 / 卸载 =====
onMounted(async () => {
  emit('dirty-change', false)
  await nextTick()

  // 预览里任务勾选框回写源码（document 档有交互勾选）。工具是唯一的交互消费方，
  // 卸载时注销，避免指向已销毁的组件。
  setTaskToggleHandler(toggleTask)

  // Typora 就地编辑宿主：previewEl 复用为编辑区
  typoraHost = createTyporaHost(
    previewEl.value,
    () => (taEl.value ? taEl.value.value : content.value),
    (v) => { applyText(v) },
  )

  const ta = taEl.value
  const pv = previewEl.value
  if (ta && pv) {
    // textarea 宽度变化 → 换行变化 → 行偏移全部重测
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        syncEngine.updateGutter()
      })
      resizeObs.observe(ta)
      previewResizeObs = new ResizeObserver(() => syncEngine.invalidate())
      previewResizeObs.observe(pv)
    }
  }

  loadDocument(content.value || '')
  syncEngine.setEnabled(scrollSyncOn.value)
})

onBeforeUnmount(() => {
  if (typoraHost) { try { typoraHost.disable() } catch {} typoraHost = null }
  clearTimeout(renderTimer)
  resizeObs?.disconnect()
  previewResizeObs?.disconnect()
  resizeObs = null
  previewResizeObs = null
  setTaskToggleHandler(null)
  syncEngine.destroy()
})
</script>
