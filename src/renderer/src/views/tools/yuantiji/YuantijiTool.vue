<template>
  <div class="ytj-tool" :class="{ narrow: isNarrow }">
    <div class="ytj-header">
      <div class="ytj-title">
        <button class="ytj-back-btn" title="返回" @click="$emit('back')"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-toolbox"></i> 工具
        <span class="ytj-sep">/</span>
        <i class="fas fa-magnifying-glass"></i> 原题机
      </div>
    </div>

    <div class="ytj-body">
      <!-- 输入区 -->
      <div class="ytj-form">
        <textarea
          ref="inputRef"
          v-model="text"
          class="ytj-input"
          placeholder="在这里粘贴题目（题面、输入输出格式都行），Ctrl + Enter 检索"
          spellcheck="false"
          @keydown.enter.ctrl.prevent="search"
          @keydown.enter.meta.prevent="search"
        ></textarea>
        <div class="ytj-actions">
          <button class="ytj-search-btn" :disabled="busy || !text.trim()" @click="search">
            <i :class="busy ? 'fas fa-spinner fa-spin' : 'fas fa-magnifying-glass'"></i>
            {{ busy ? '检索中…' : '检索' }}
          </button>
          <label class="ytj-opt" title="先用模型把题面改写成简洁描述再检索（原题机的默认行为）；取消勾选可跳过这一步">
            <input v-model="rewrite" type="checkbox" :disabled="busy" /> 题面重写
          </label>
          <span v-if="busy" class="ytj-hint">通常 5～15 秒，请稍候…</span>
          <span v-else-if="searched" class="ytj-hint">耗时 {{ (elapsed / 1000).toFixed(1) }}s · {{ results.length }} 条结果</span>
          <button v-if="busy" class="ytj-clear-btn" title="放弃这次检索" @click="cancelSearch">取消</button>
          <button v-else-if="text || results.length" class="ytj-clear-btn" @click="reset">清空</button>
        </div>
      </div>

      <!-- 结果区 -->
      <div class="ytj-results">
        <div v-if="error" class="ytj-state ytj-state--error">
          <i class="fas fa-triangle-exclamation"></i> {{ error }}
        </div>
        <div v-else-if="busy && !results.length" class="ytj-state">
          <i class="fas fa-spinner fa-spin"></i> 正在检索…
        </div>
        <div v-else-if="!results.length" class="ytj-state">
          <i class="fas fa-circle-info"></i>
          <span>粘贴题面后点「检索」，找出原题与高度相似的题目<br />地址已自动指向 vjudge，可直接去提交</span>
        </div>
        <template v-else>
          <div v-for="r in results" :key="r.rank + '-' + r.uid" class="ytj-item">
            <div class="ytj-rank">{{ String(r.rank).padStart(2, '0') }}</div>
            <div class="ytj-main">
              <div class="ytj-line1">
                <a class="ytj-name" :href="r.url" :title="r.url" @click.prevent="open(r.url)">{{ r.title }}</a>
                <span class="ytj-score">{{ Number(r.score || 0).toFixed(3) }}</span>
              </div>
              <div class="ytj-meta">
                <span class="ytj-src">{{ r.src }}</span>
                <span class="ytj-uid">{{ idOf(r.uid) }}</span>
                <span v-if="r.via === 'origin'" class="ytj-badge" title="该 OJ 不在 vjudge 全集内，已回退到原站地址">原站</span>
              </div>
              <div v-if="r.snip" class="ytj-snip">{{ r.snip }}</div>
              <div v-if="r.also && r.also.length" class="ytj-also">
                <span>也出现在</span>
                <a v-for="a in r.also" :key="a.uid" :href="a.url" @click.prevent="open(a.url)">{{ a.uid }}</a>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="ytj-foot">
        数据来自 <a href="https://yuantiji.ac" @click.prevent="open('https://yuantiji.ac')">原题机 yuantiji.ac</a>，地址已指向 vjudge
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useNarrow } from '../../../composables/useNarrow.js'
import './yuantiji-tool.css'

defineEmits(['back'])

const { isNarrow } = useNarrow()

const inputRef = ref(null)
const text = ref('')
const rewrite = ref(true)
const busy = ref(false)
const searched = ref(false)
const error = ref('')
const results = ref([])
const elapsed = ref(0)

// 取消/重发用：请求回来时若序号已变，说明这次结果已作废，直接丢弃
let reqSeq = 0

function idOf(uid) {
  const s = String(uid || '')
  const i = s.indexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}

async function search() {
  const q = text.value.trim()
  if (!q || busy.value) return
  const my = ++reqSeq
  busy.value = true
  error.value = ''
  try {
    const r = await window.api.yuantijiSearch({ query: q, k: 20, rewrite: rewrite.value })
    if (my !== reqSeq) return // 已被取消或被新一次检索取代
    if (!r || !r.success) {
      results.value = []
      searched.value = false
      error.value = (r && r.error) || '检索失败'
      return
    }
    results.value = Array.isArray(r.results) ? r.results : []
    elapsed.value = r.elapsed || 0
    searched.value = true
    if (!results.value.length) error.value = '没有找到相似的题目，换一段题面再试试'
  } catch (e) {
    if (my !== reqSeq) return
    results.value = []
    searched.value = false
    error.value = (e && e.message) || '检索失败'
  } finally {
    if (my === reqSeq) busy.value = false
  }
}

// 取消只作废这次结果并放开界面（IPC 请求无法真正中止，回来会被 reqSeq 拦掉）
function cancelSearch() {
  reqSeq++
  busy.value = false
}

function reset() {
  reqSeq++
  text.value = ''
  results.value = []
  error.value = ''
  elapsed.value = 0
  searched.value = false
  busy.value = false
}

function open(url) {
  if (!url) return
  try { window.api.openExternal(url) } catch { window.open(url, '_blank') }
}
</script>
