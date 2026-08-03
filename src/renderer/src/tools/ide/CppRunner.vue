<template>
  <div ref="rootEl" class="cpp-runner">
    <div class="cpp-runner-header">
      <div class="cpp-runner-title-row">
        <span class="cpp-runner-title"><i class="fas fa-flask"></i> 样例测试</span>
        <div class="cpp-runner-actions">
          <label class="cpp-time-limit" title="单个测试点的运行时限">
            时限
            <input v-model.number="timeLimitMs" type="number" min="500" max="10000" step="500" />
            ms
          </label>
          <button class="cpp-btn" title="添加测试" :disabled="running" @click="addTest"><i class="fas fa-plus"></i></button>
          <button class="cpp-btn cpp-btn-run" title="运行测试 (Ctrl+Enter)" :disabled="running" @click="runAll">
            <i class="fas" :class="running ? 'fa-spinner fa-spin' : 'fa-play'"></i>
          </button>
        </div>
      </div>
      <div class="cpp-gpp" :class="{ ok: gppState === 'ok', bad: gppState === 'bad' }">
        <i class="fas fa-terminal"></i>
        <span
          class="cpp-gpp-path"
          :class="{ ok: gppState === 'ok', bad: gppState === 'bad' }"
          :title="gppInfo || (gppInput ? '正在检测指定路径…' : '自动查找 g++ 中…')"
        >
          <template v-if="gppState === 'ok'">{{ gppInput ? '自定义 · ' : '自动 · ' }}{{ gppInfo }}</template>
          <template v-else-if="gppState === 'bad'">未找到 g++</template>
          <template v-else>检测中…</template>
        </span>
        <button class="cpp-gpp-btn" title="更改 g++ 路径" @click="gppEditing = true">更改</button>
      </div>
    </div>

    <div v-if="gppEditing" class="cpp-modal-mask" @click.self="gppEditing = false">
      <div class="cpp-modal">
        <div class="cpp-modal-title"><i class="fas fa-terminal"></i> g++ 路径设置</div>
        <div class="cpp-modal-desc">留空则自动查找（Windows / Linux / macOS 常见安装位置）；也可手动指定 g++ 的完整路径。</div>
        <input
          v-model="gppInput"
          class="cpp-gpp-input cpp-modal-input"
          placeholder="留空自动查找，例如 C:\Program Files\RedPanda-Cpp\mingw64\bin\g++.exe"
          spellcheck="false"
          @keydown.enter="saveGppEdit"
        />
        <div v-if="gppState === 'ok'" class="cpp-modal-hint ok"><i class="fas fa-check-circle"></i> 当前解析到：{{ gppInfo }}</div>
        <div v-else-if="gppState === 'bad'" class="cpp-modal-hint bad"><i class="fas fa-exclamation-circle"></i> {{ gppInfo }}</div>
        <div class="cpp-modal-actions">
          <button class="cpp-btn" @click="gppInput = ''; refreshGpp()">自动查找</button>
          <button class="cpp-btn" @click="gppEditing = false">取消</button>
          <button class="cpp-btn cpp-btn-run" @click="saveGppEdit">保存</button>
        </div>
      </div>
    </div>

    <div v-if="runError" class="cpp-run-error"><i class="fas fa-exclamation-triangle"></i> {{ runError }}</div>

    <div v-if="compileError" class="cpp-compile-error">
      <div class="cpp-block-title"><i class="fas fa-times-circle"></i> 编译错误</div>
      <pre class="cpp-pre cpp-error-pre">{{ compileError }}</pre>
    </div>

    <div v-if="summaryText" class="cpp-summary" :class="{ ok: passedCount === tests.length }">
      <i class="fas" :class="passedCount === tests.length ? 'fa-check-circle' : 'fa-info-circle'"></i>
      {{ summaryText }}
    </div>

    <div class="cpp-tests">
      <div v-for="(test, i) in tests" :key="i" class="cpp-test" :class="{ 'has-result': !!results[i] }">
        <div class="cpp-test-head">
          <span class="cpp-test-name"><i class="fas fa-vial"></i> 测试 #{{ i + 1 }}</span>
          <span v-if="results[i]" class="cpp-status" :class="'st-' + results[i].status">
            <i class="fas" :class="statusIcon(results[i].status)"></i>
            {{ statusText(results[i].status) }} · {{ results[i].timeMs }}ms
          </span>
          <button class="cpp-test-del" title="删除此测试" @click="removeTest(i)"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="cpp-test-body">
          <div class="cpp-test-col">
            <label class="cpp-test-label">输入</label>
            <textarea v-model="test.input" class="cpp-textarea" spellcheck="false" placeholder="在此粘贴输入数据…"></textarea>
          </div>
          <div class="cpp-test-col">
            <label class="cpp-test-label">期望输出</label>
            <textarea v-model="test.expected" class="cpp-textarea" spellcheck="false" placeholder="在此粘贴期望输出…"></textarea>
          </div>
          <div v-if="results[i]" class="cpp-test-col cpp-test-result">
            <label class="cpp-test-label">实际输出
              <span v-if="results[i].stderr" class="cpp-stderr-hint" title="程序的标准错误输出">（有 stderr）</span>
            </label>
            <div v-if="results[i].status === 'WA'" class="cpp-diff">
              <div class="cpp-diff-side">
                <div class="cpp-diff-side-title">期望</div>
                <pre class="cpp-pre"><template v-for="(ln, k) in diffFor(i).exp" :key="k"><span :class="ln.rm ? 'diff-rm' : ''">{{ ln.text || '␣' }}</span>
</template></pre>
              </div>
              <div class="cpp-diff-side">
                <div class="cpp-diff-side-title">实际</div>
                <pre class="cpp-pre"><template v-for="(ln, k) in diffFor(i).act" :key="k"><span :class="ln.add ? 'diff-add' : ''">{{ ln.text || '␣' }}</span>
</template></pre>
              </div>
            </div>
            <pre v-else-if="results[i].status === 'RE' && results[i].stderr" class="cpp-pre cpp-error-pre">{{ results[i].stderr }}</pre>
            <pre v-else-if="results[i].status === 'RE'" class="cpp-pre cpp-error-pre">程序异常退出（exit code: {{ results[i].exitCode }}）</pre>
            <pre v-else-if="results[i].status === 'TLE'" class="cpp-pre cpp-tle-pre">超过时限（{{ timeLimitMs }}ms），已强制终止</pre>
            <pre v-else class="cpp-pre cpp-ok-pre">{{ results[i].actual || '（无输出）' }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  source: { type: String, default: '' },
  tests: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:tests'])

const running = ref(false)
const compileError = ref('')
const runError = ref('')
const timeLimitMs = ref(2000)
const results = ref([])
const rootEl = ref(null)
const gppInput = ref('')
const gppState = ref('')
const gppInfo = ref('')
const gppEditing = ref(false)

const passedCount = computed(() => results.value.filter(r => r && r.status === 'AC').length)
const summaryText = computed(() => {
  if (!results.value.length) return ''
  return `通过 ${passedCount.value} / ${results.value.length} 个测试点`
})

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function lineDiff(a, b) {
  const aLines = String(a || '').replace(/\r\n/g, '\n').split('\n')
  const bLines = String(b || '').replace(/\r\n/g, '\n').split('\n')
  while (aLines.length && aLines[aLines.length - 1] === '') aLines.pop()
  while (bLines.length && bLines[bLines.length - 1] === '') bLines.pop()
  const n = aLines.length, m = bLines.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const exp = [], act = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      exp.push({ text: esc(aLines[i]) })
      act.push({ text: esc(bLines[j]) })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      exp.push({ text: esc(aLines[i]), rm: true })
      i++
    } else {
      act.push({ text: esc(bLines[j]), add: true })
      j++
    }
  }
  while (i < n) { exp.push({ text: esc(aLines[i]), rm: true }); i++ }
  while (j < m) { act.push({ text: esc(bLines[j]), add: true }); j++ }
  return { exp, act }
}

function diffFor(i) {
  const r = results.value[i]
  if (!r || r.status !== 'WA') return { exp: [], act: [] }
  return lineDiff(r.expected, r.actual)
}

function statusText(s) {
  return { AC: '通过', WA: '答案错误', RE: '运行错误', TLE: '超时' }[s] || s
}

function statusIcon(s) {
  return { AC: 'fa-check', WA: 'fa-times', RE: 'fa-bug', TLE: 'fa-hourglass-half' }[s] || 'fa-circle'
}

function addTest() {
  const list = props.tests.slice()
  list.push({ input: '', expected: '' })
  emit('update:tests', list)
  results.value = []
}

function removeTest(i) {
  const list = props.tests.slice()
  list.splice(i, 1)
  emit('update:tests', list)
  results.value = results.value.filter((_, k) => k !== i)
}

async function runAll() {
  if (running.value) return
  if (!props.tests.length) {
    runError.value = '请先添加测试用例'
    return
  }
  running.value = true
  compileError.value = ''
  runError.value = ''
  results.value = []
  try {
    // Electron IPC 结构化克隆无法处理 Vue 响应式 Proxy，需先转成纯对象
    const plainTests = props.tests.map(t => ({
      input: String(t?.input ?? ''),
      expected: String(t?.expected ?? '')
    }))
    const r = await window.api.runCppTests(props.source, plainTests, timeLimitMs.value, gppInput.value.trim())
    if (!r.success) {
      runError.value = r.error || '运行失败'
    } else if (r.compileError) {
      compileError.value = r.compileError
    } else {
      results.value = r.results
    }
  } catch (e) {
    runError.value = e.message || String(e)
  } finally {
    running.value = false
  }
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (!rootEl.value || rootEl.value.offsetParent === null) return
    e.preventDefault()
    runAll()
  }
}

watch(() => props.source, () => {
  results.value = []
  compileError.value = ''
  runError.value = ''
})

async function refreshGpp() {
  try {
    const r = await window.api.getCppGppPath(gppInput.value.trim())
    if (r.success) {
      gppState.value = 'ok'
      gppInfo.value = r.gpp
    } else {
      gppState.value = 'bad'
      gppInfo.value = r.error || '未找到 g++'
    }
  } catch (e) {
    gppState.value = 'bad'
    gppInfo.value = e.message || String(e)
  }
}

async function saveGppEdit() {
  gppInput.value = gppInput.value.trim()
  try {
    const s = await window.api.loadSetting()
    s.ideGppPath = gppInput.value
    await window.api.saveSetting(s)
  } catch {}
  await refreshGpp()
  gppEditing.value = false
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  try {
    const s = await window.api.loadSetting()
    if (typeof s?.ideGppPath === 'string') gppInput.value = s.ideGppPath
  } catch {}
  await refreshGpp()
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>
