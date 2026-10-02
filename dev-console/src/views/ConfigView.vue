<script setup>
/**
 * 系统配置
 * ------------------------------------------------------------
 * 表单由后端下发的 schema（items 数组）动态渲染 —— 新增配置项时前端零改动。
 * 每项带 type/label/desc/unit/min/max/default，前端据此选控件与校验。
 *
 * 保存语义：只提交「改过的项」；后端做二次强校验，任一项非法则整批拒绝。
 */
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api.js'
import { session, loadConfig, setConfigItems } from '@/lib/store.js'
import { errText, toast } from '@/lib/util.js'
import EmptyState from '@/components/EmptyState.vue'
import TableSkeleton from '@/components/TableSkeleton.vue'
import { inject } from 'vue'

const confirm = inject('confirm')

const items = ref([])
const loading = ref(true)
const loadError = ref('')
const draft = ref({})      // key -> 当前编辑值
const saving = ref(false)

async function load(silent) {
  if (!silent) loading.value = true
  try {
    const r = await api.getConfig()
    items.value = (r && r.items) || []
    setConfigItems(items.value)
    const d = {}
    for (const it of items.value) d[it.key] = it.value
    draft.value = d
    loadError.value = ''
  } catch (e) {
    if (!silent) loadError.value = errText(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => load(false))

const changed = computed(() =>
  items.value.filter((it) => draft.value[it.key] !== it.value)
)
const dirty = computed(() => changed.value.length > 0)

function isInvalid(it) {
  const v = draft.value[it.key]
  if (it.type === 'number') {
    const n = Number(v)
    if (!Number.isFinite(n)) return '必须是数字'
    if (it.min !== undefined && n < it.min) return `不能小于 ${it.min}`
    if (it.max !== undefined && n > it.max) return `不能大于 ${it.max}`
  }
  if (it.type === 'string' && it.maxLen && String(v).length > it.maxLen) {
    return `长度不能超过 ${it.maxLen}`
  }
  return ''
}

const invalidKeys = computed(() =>
  items.value.filter((it) => isInvalid(it)).map((it) => it.key)
)

async function save() {
  if (!dirty.value || invalidKeys.value.length) return
  saving.value = true
  const patch = {}
  for (const it of changed.value) {
    patch[it.key] = it.type === 'number' ? Number(draft.value[it.key]) : draft.value[it.key]
  }
  try {
    await api.updateConfig(patch)
    await loadConfig()
    toast.ok(`已保存 ${Object.keys(patch).length} 项配置`)
    await load(true)
  } catch (e) {
    toast.error('保存失败：' + errText(e))
  } finally {
    saving.value = false
  }
}

function resetOne(it) {
  draft.value[it.key] = it.default
}

async function resetAll() {
  const okay = await confirm.ask({
    title: '恢复默认配置',
    message: '把所有配置项恢复为出厂默认值。已保存的自定义设置会丢失。',
    danger: true,
    confirmText: '恢复默认',
  })
  if (!okay) return
  try {
    await api.resetConfig([])
    toast.ok('已恢复默认配置')
    await load(false)
  } catch (e) {
    toast.error('恢复失败：' + errText(e))
  }
}

function labelOf(it) {
  return it.label || it.key
}
</script>

<template>
  <div class="col" style="gap: 16px">
    <div class="card">
      <div class="toolbar">
        <div>
          <div class="card__title" style="font-size: 14px">系统配置</div>
          <div class="card__sub">
            {{ dirty ? `有 ${changed.length} 项待保存` : '所有修改已保存' }}
            <template v-if="invalidKeys.length"> · <span style="color: var(--danger)">{{ invalidKeys.length }} 项填写有误</span></template>
          </div>
        </div>
        <div class="grow" />
        <button class="btn btn--sm" :disabled="saving" @click="resetAll">恢复默认</button>
        <button class="btn btn--sm" :disabled="saving || !dirty" @click="load(false)">放弃修改</button>
        <button class="btn btn--primary btn--sm" :disabled="saving || !dirty || invalidKeys.length" @click="save">
          <span v-if="saving" class="spinner" />
          <span>保存</span>
        </button>
      </div>
    </div>

    <div class="card">
      <TableSkeleton v-if="loading" :rows="7" :cols="2" />
      <EmptyState v-else-if="loadError" icon="fa-triangle-exclamation" title="加载失败" :sub="loadError">
        <button class="btn btn--sm" @click="load(false)"><i class="fa-solid fa-arrow-rotate-right" /><span>重试</span></button>
      </EmptyState>
      <EmptyState v-else-if="!items.length" icon="fa-sliders" title="没有可配置项" />
      <div v-else class="cfg-list">
        <div v-for="it in items" :key="it.key" class="cfg" :class="{ 'cfg--changed': draft[it.key] !== it.value }">
          <div class="cfg__info">
            <div class="row" style="gap: 7px">
              <span class="cfg__label">{{ labelOf(it) }}</span>
              <span v-if="draft[it.key] !== it.value" class="badge badge--warn">已修改</span>
              <button
                v-if="draft[it.key] !== it.default"
                class="cfg__reset"
                title="恢复此项默认值"
                @click="resetOne(it)"
              >
                <i class="fa-solid fa-arrow-rotate-left" />
              </button>
            </div>
            <p v-if="it.desc" class="cfg__desc">{{ it.desc }}</p>
            <p class="cfg__key mono">{{ it.key }}</p>
          </div>

          <div class="cfg__control">
            <!-- 布尔：开关 -->
            <button
              v-if="it.type === 'boolean'"
              class="switch"
              role="switch"
              :aria-checked="String(!!draft[it.key])"
              @click="draft[it.key] = !draft[it.key]"
            >
              <span class="sr-only">{{ labelOf(it) }}</span>
            </button>

            <!-- 数字：输入框 + 单位 -->
            <div v-else-if="it.type === 'number'" class="row" style="gap: 7px">
              <input
                v-model="draft[it.key]"
                type="number"
                class="input mono"
                style="width: 118px; text-align: right"
                :min="it.min"
                :max="it.max"
              />
              <span v-if="it.unit" class="muted nowrap" style="font-size: 12px; width: 30px">{{ it.unit }}</span>
            </div>

            <!-- 短字符串：输入框 -->
            <input
              v-else
              v-model="draft[it.key]"
              class="input"
              style="width: 300px"
              :maxlength="it.maxLen || undefined"
            />
          </div>

          <p v-if="isInvalid(it)" class="cfg__err">{{ isInvalid(it) }}</p>
          <p v-else-if="it.default !== undefined" class="cfg__def">
            默认：<span class="mono">{{ String(it.default) === '' ? '（空）' : it.default }}</span>
            <template v-if="it.min !== undefined"> · 范围 {{ it.min }}–{{ it.max }}{{ it.unit || '' }}</template>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; padding: 14px 16px; flex-wrap: wrap; }

.cfg-list { display: flex; flex-direction: column; }
.cfg {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 20px;
  align-items: center;
  padding: 15px 18px;
  border-bottom: 1px solid var(--border);
  transition: background var(--t-fast);
}
.cfg:last-child { border-bottom: none; }
.cfg--changed { background: var(--accent-soft); }
.cfg__label { font-size: 13.5px; font-weight: 600; }
.cfg__desc { font-size: 12.5px; color: var(--text-3); line-height: 1.5; margin-top: 3px; max-width: 560px; }
.cfg__key { font-size: 11px; color: var(--text-3); opacity: 0.75; margin-top: 3px; }
.cfg__reset {
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  font-size: 13px;
  padding: 0 3px;
  border-radius: 4px;
}
.cfg__reset:hover { color: var(--accent); background: var(--bg-hover); }
.cfg__err { grid-column: 1 / -1; font-size: 12px; color: var(--danger); }
.cfg__def { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.cfg__control { justify-self: end; }

@media (max-width: 720px) {
  .cfg { grid-template-columns: 1fr; }
  .cfg__control { justify-self: start; }
}
</style>
