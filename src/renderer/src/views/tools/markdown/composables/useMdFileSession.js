import { ref, computed } from 'vue'
import { renderDocument } from '../../../../markdown/index.js'
import { useDialog } from '../../../../composables/useDialog.js'
import { useToast } from '../../../../composables/useToast.js'
import { useFileDrop } from '../../../../composables/useFileDrop.js'
import { useToolFile, b64ToText, textToBase64 } from '../../shared/useToolFile.js'

const TEXT_EXT = /\.(md|markdown|txt|text)$/i

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

export function useMdFileSession({ content, loadDocument }) {
  const dialog = useDialog()
  const toast = useToast()

  const savedContent = ref('')
  const exporting = ref(false)
  const dirty = computed(() => content.value !== savedContent.value)

  const {
    fileName,
    savedName,
    savedPath,
    saving,
    saveState,
    saveBase64File
  } = useToolFile({
    defaultName: '',
    dirtyRef: dirty
  })

  // 打开 / 拖入都会整体替换正文：未保存时必须先问一句，否则本次编辑直接蒸发。
  async function confirmDiscard(msg) {
    if (!dirty.value) return true
    return await dialog.confirm(msg || '当前内容未保存，确定放弃并载入新文件？')
  }

  async function openFile() {
    if (!(await confirmDiscard())) return
    const r = await window.api.selectFile()
    if (!r.success || !r.data) return
    try {
      const text = b64ToText(r.data)
      fileName.value = r.name
      savedName.value = r.name
      savedPath.value = r.path || ''
      savedContent.value = text
      loadDocument(text)
    } catch (e) {
      await dialog.alert({ title: '读取失败', message: '读取文件失败：' + e.message })
    }
  }

  async function newFile() {
    if (dirty.value) {
      const ok = await dialog.confirm('当前内容未保存，确定新建并丢弃？')
      if (!ok) return
    }
    fileName.value = ''
    savedName.value = ''
    savedPath.value = ''
    savedContent.value = ''
    loadDocument('')
  }

  async function save(forceDialog = false) {
    if (saving.value) return
    const name = (fileName.value && fileName.value.trim()) || '未命名.md'
    await saveBase64File({
      base64: textToBase64(content.value),
      name,
      mime: 'text/markdown',
      forceDialog,
      onSuccess: () => {
        savedContent.value = content.value
      }
    })
  }

  function saveAs() {
    return save(true)
  }

  async function exportPng() {
    if (exporting.value) return
    if (!content.value.trim()) return
    exporting.value = true
    try {
      const r = await window.api.exportMarkdownPng(fileName.value || '未命名.md', renderDocument(content.value))
      if (r && r.success) {
        toast.showToast('已导出图片', 'success', 2000)
      } else if (!r || !r.canceled) {
        await dialog.alert({ title: '导出失败', message: '导出失败：' + ((r && r.error) || '未知错误') })
      }
    } catch (e) {
      console.error('export failed:', e)
      await dialog.alert({ title: '导出失败', message: '导出失败：' + ((e && e.message) || '未知错误') })
    } finally {
      exporting.value = false
    }
  }

  async function copyHtml() {
    if (!content.value.trim()) {
      toast.showToast('文档内容为空', 'warning', 1800)
      return
    }
    const html = renderDocument(content.value)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(html)
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea')
        ta.value = html
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.showToast('已复制 HTML 代码', 'success', 2000)
    } catch (e) {
      toast.showToast('复制失败：' + ((e && e.message) || '未知错误'), 'error', 2000)
    }
  }

  async function exportHtml() {
    if (exporting.value) return
    if (!content.value.trim()) {
      toast.showToast('文档内容为空', 'warning', 1800)
      return
    }
    exporting.value = true
    try {
      const docHtml = renderDocument(content.value)
      const title = (fileName.value || '未命名').replace(/\.(md|markdown|txt)$/i, '')
      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  color: #24292e;
  background-color: #ffffff;
}
@media (prefers-color-scheme: dark) {
  body { color: #c9d1d9; background-color: #0d1117; }
  pre { background-color: #161b22 !important; }
  code { background-color: rgba(110, 118, 129, 0.4); }
  blockquote { border-left-color: #30363d; color: #8b949e; }
  table th, table td { border-color: #30363d; }
  hr { border-top-color: #30363d; }
}
h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
p, ul, ol, table, pre, blockquote { margin-top: 0; margin-bottom: 16px; }
code { font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; font-size: 85%; padding: 0.2em 0.4em; border-radius: 6px; background-color: rgba(175, 184, 193, 0.2); }
pre { padding: 16px; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f6f8fa; border-radius: 6px; }
pre code { padding: 0; background: transparent; }
blockquote { padding: 0 1em; color: #57606a; border-left: 0.25em solid #d0d7de; }
table { border-spacing: 0; border-collapse: collapse; width: 100%; overflow: auto; }
table th, table td { padding: 6px 13px; border: 1px solid #d0d7de; }
table tr:nth-child(2n) { background-color: rgba(175, 184, 193, 0.05); }
img { max-width: 100%; box-sizing: border-box; }
hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #d0d7de; border: 0; }
</style>
</head>
<body class="luogu-md">
${docHtml}
</body>
</html>`
      const base64 = textToBase64(fullHtml)
      const baseName = title + '.html'
      const r = await window.api.downloadFile(base64, baseName, 'text/html')
      if (r && r.success) {
        toast.showToast('已导出 HTML 文件', 'success', 2000)
      } else if (!r || !r.canceled) {
        await dialog.alert({ title: '导出失败', message: '导出 HTML 失败：' + ((r && r.error) || '未知错误') })
      }
    } catch (e) {
      console.error('export html failed:', e)
      await dialog.alert({ title: '导出失败', message: '导出失败：' + ((e && e.message) || '未知错误') })
    } finally {
      exporting.value = false
    }
  }

  const { dropZoneProps } = useFileDrop({
    multiple: false,
    accept: (file) => TEXT_EXT.test(file.name),
    onFiles: async ([file]) => {
      if (!(await confirmDiscard('当前内容未保存，拖入新文件会覆盖它，确定继续？'))) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result || '')
        fileName.value = file.name
        savedName.value = file.name
        savedPath.value = ''
        savedContent.value = text
        loadDocument(text)
      }
      reader.readAsText(file, 'utf-8')
    }
  })

  return {
    fileName,
    savedName,
    savedPath,
    saving,
    exporting,
    dirty,
    saveState,
    dropZoneProps,
    openFile,
    newFile,
    save,
    saveAs,
    exportPng,
    copyHtml,
    exportHtml
  }
}
