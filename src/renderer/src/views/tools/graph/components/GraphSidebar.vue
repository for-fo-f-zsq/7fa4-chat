<template>
  <div class="graph-sidebar-root">
    <UiTabs
      v-model="activeTab"
      :items="SIDEBAR_TABS"
      variant="line"
      size="sm"
      class="graph-sidebar-tabs"
    >
      <!-- Tab 1: 图结构（边列表 + 随机生成） -->
      <div v-if="activeTab === 'structure'" class="graph-tab-panel">
        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-file-alt" aria-hidden="true"></i>
            <span>边列表</span>
            <span class="graph-block-hint">实时生效</span>
          </div>

          <UiTextarea
            :model-value="inputText"
            :rows="8"
            spellcheck="false"
            aria-label="边列表输入"
            placeholder="1 2&#10;2 3 5&#10;4 4&#10;或 JSON: [[1,2],[2,3,5]]"
            @update:model-value="$emit('inputText', $event)"
          />
          <p class="graph-help">每行 <code>u v [w]</code>，<code>#</code> 开头为注释；单独一行数字表示孤立点。</p>

          <div class="graph-field-row">
            <span class="graph-field-label">编号起始</span>
            <UiDropdown
              class="graph-select"
              :model-value="offset"
              :options="OFFSET_OPTIONS"
              size="sm"
              aria-label="编号起始"
              @update:model-value="$emit('update:offset', Number($event))"
            />
          </div>

          <div class="graph-btn-row">
            <UiButton
              size="sm"
              variant="secondary"
              icon="fas fa-file-lines"
              title="加载示例图数据"
              @click="$emit('loadExample')"
            >
              示例
            </UiButton>
            <UiButton
              size="sm"
              variant="secondary"
              icon="fas fa-eraser"
              title="清空边列表与输入"
              @click="$emit('clearInput')"
            >
              清空
            </UiButton>
          </div>
        </section>

        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-tags" aria-hidden="true"></i>
            <span>节点标签</span>
            <span class="graph-block-hint">可选</span>
          </div>
          <UiTextarea
            :model-value="labelsText"
            :rows="3"
            spellcheck="false"
            aria-label="节点标签"
            placeholder="a&#10;_&#10;c"
            @update:model-value="$emit('inputLabels', $event)"
          />
          <p class="graph-help">每行对应一个节点，<code>_</code> 表示保留默认编号。</p>
        </section>

        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-dice" aria-hidden="true"></i>
            <span>随机生成</span>
          </div>

          <div class="graph-field-row">
            <span class="graph-field-label">类型</span>
            <UiDropdown
              class="graph-select"
              :model-value="randMode"
              :options="RAND_MODE_OPTIONS"
              size="sm"
              aria-label="随机图类型"
              @update:model-value="$emit('update:randMode', $event)"
            />
          </div>

          <div class="graph-field-grid">
            <label class="graph-field-cell">
              <span class="graph-field-label">节点数 n</span>
              <UiInput
                type="number"
                size="sm"
                :model-value="randN"
                aria-label="随机节点数"
                @update:model-value="$emit('update:randN', Number($event) || 1)"
              />
            </label>
            <label class="graph-field-cell">
              <span class="graph-field-label">边数 m{{ randMode === 'tree' ? '（树自动）' : '' }}</span>
              <UiInput
                type="number"
                size="sm"
                :model-value="randM"
                :disabled="randMode === 'tree'"
                aria-label="随机边数"
                @update:model-value="$emit('update:randM', Number($event) || 0)"
              />
            </label>
          </div>

          <div class="graph-switch-row">
            <UiSwitch
              :model-value="randWeighted"
              size="sm"
              label="带权边（随机 1-9）"
              @update:model-value="$emit('update:randWeighted', $event)"
            />
          </div>

          <UiButton
            size="sm"
            variant="primary"
            icon="fas fa-dice"
            block
            title="一键随机生成图结构（会覆盖当前图）"
            @click="$emit('randomGraph')"
          >
            生成随机图
          </UiButton>
        </section>
      </div>

      <!-- Tab 2: 物理布局参数 -->
      <div v-else-if="activeTab === 'physics'" class="graph-tab-panel">
        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-sliders" aria-hidden="true"></i>
            <span>力学参数</span>
            <span class="graph-block-hint">拖动即时生效</span>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">节点排斥力</span>
              <span class="graph-param-val">{{ repulsion.toFixed(1) }}x</span>
            </div>
            <UiSlider
              :model-value="repulsion"
              :min="0.2"
              :max="20"
              :step="0.5"
              :show-value="false"
              size="sm"
              aria-label="节点排斥力"
              @update:model-value="$emit('update:repulsion', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">Repulsion · 越大节点越分散</p>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">边弹簧拉力</span>
              <span class="graph-param-val">{{ spring.toFixed(1) }}x</span>
            </div>
            <UiSlider
              :model-value="spring"
              :min="0.2"
              :max="20"
              :step="0.5"
              :show-value="false"
              size="sm"
              aria-label="边弹簧拉力"
              @update:model-value="$emit('update:spring', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">Spring · 越大相邻节点越紧凑</p>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">向心力</span>
              <span class="graph-param-val">{{ centripetal.toFixed(1) }}x</span>
            </div>
            <UiSlider
              :model-value="centripetal"
              :min="0"
              :max="50"
              :step="1"
              :show-value="false"
              size="sm"
              aria-label="向心力"
              @update:model-value="$emit('update:centripetal', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">Centripetal · 越大整体越收紧</p>
          </div>

          <UiButton
            size="sm"
            variant="secondary"
            icon="fas fa-rotate-left"
            block
            title="重置所有物理模拟参数为默认值"
            @click="resetPhysics"
          >
            恢复默认参数
          </UiButton>
        </section>
      </div>

      <!-- Tab 3: 图论算法分析 -->
      <div v-else-if="activeTab === 'algo'" class="graph-tab-panel">
        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-diagram-project" aria-hidden="true"></i>
            <span>分析算法</span>
          </div>
          <UiDropdown
            class="graph-select"
            :model-value="highlight"
            :options="HIGHLIGHT_OPTIONS"
            size="sm"
            aria-label="分析高亮算法"
            @update:model-value="$emit('update:highlight', $event)"
          />

          <div
            v-if="highlight === 'shortest' || highlight === 'flow'"
            class="graph-field-grid"
            :class="{ 'is-single': highlight !== 'flow' }"
          >
            <label class="graph-field-cell">
              <span class="graph-field-label">源点 Source</span>
              <UiInput
                type="number"
                size="sm"
                :model-value="algoSrc"
                aria-label="源点"
                @update:model-value="$emit('update:algoSrc', Number($event) || 0)"
              />
            </label>
            <label v-if="highlight === 'flow'" class="graph-field-cell">
              <span class="graph-field-label">汇点 Sink</span>
              <UiInput
                type="number"
                size="sm"
                :model-value="algoSink"
                aria-label="汇点"
                @update:model-value="$emit('update:algoSink', Number($event) || 0)"
              />
            </label>
          </div>
        </section>

        <section v-if="highlight === 'none'" class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-circle-info" aria-hidden="true"></i>
            <span>尚未选择算法</span>
          </div>
          <p class="graph-help">在上方选择一种分析算法，这里会显示关键指标与具体明细（边集、距离、序列等）。</p>
        </section>

        <section v-else class="graph-analysis" :data-status="analysis.status">
          <header class="graph-analysis-head">
            <span class="graph-analysis-badge">{{ STATUS_TEXT[analysis.status] || '结果' }}</span>
            <span class="graph-analysis-summary">{{ analysis.summary || '暂无分析输出' }}</span>
          </header>

          <div v-if="analysis.metrics.length" class="graph-metrics">
            <div v-for="m in analysis.metrics" :key="m.label" class="graph-metric">
              <span class="graph-metric__k">{{ m.label }}</span>
              <span class="graph-metric__v">{{ m.value }}</span>
            </div>
          </div>

          <div v-for="(list, i) in analysis.lists" :key="list.label + i" class="graph-analysis-list">
            <div class="graph-analysis-list__title">
              <span>{{ list.label }}</span>
              <span v-if="list.items.length" class="graph-analysis-list__count">{{ list.items.length }}</span>
            </div>
            <ul v-if="list.items.length" class="graph-analysis-list__items">
              <li v-for="(item, j) in list.items" :key="j">{{ item }}</li>
            </ul>
            <p v-else class="graph-analysis-list__empty">无</p>
          </div>

          <p class="graph-analysis-meta">{{ info }}</p>
        </section>
      </div>
    </UiTabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { UiDropdown, UiButton, UiInput, UiSlider, UiSwitch, UiTextarea, UiTabs } from '@/ui'
import { OFFSET_OPTIONS, RAND_MODE_OPTIONS, HIGHLIGHT_OPTIONS } from '../graphConstants.js'

defineProps({
  inputText: { type: String, required: true },
  labelsText: { type: String, required: true },
  offset: { type: Number, required: true },
  randMode: { type: String, required: true },
  randN: { type: Number, required: true },
  randM: { type: Number, required: true },
  randWeighted: { type: Boolean, required: true },
  repulsion: { type: Number, required: true },
  spring: { type: Number, required: true },
  centripetal: { type: Number, required: true },
  highlight: { type: String, required: true },
  algoSrc: { type: Number, required: true },
  algoSink: { type: Number, required: true },
  info: { type: String, required: true },
  analysis: {
    type: Object,
    default: () => ({ status: 'info', summary: '', metrics: [], lists: [] })
  }
})

const emit = defineEmits([
  'inputText',
  'inputLabels',
  'update:offset',
  'loadExample',
  'clearInput',
  'update:randMode',
  'update:randN',
  'update:randM',
  'update:randWeighted',
  'randomGraph',
  'update:repulsion',
  'update:spring',
  'update:centripetal',
  'forceChange',
  'update:highlight',
  'update:algoSrc',
  'update:algoSink'
])

const activeTab = ref('structure')

const SIDEBAR_TABS = [
  { key: 'structure', label: '图结构', icon: 'fas fa-sitemap' },
  { key: 'physics', label: '物理布局', icon: 'fas fa-sliders-h' },
  { key: 'algo', label: '算法分析', icon: 'fas fa-diagram-project' }
]

const STATUS_TEXT = { ok: '完成', warn: '提示', error: '无法计算', info: '结果' }

function resetPhysics() {
  emit('update:repulsion', 1)
  emit('update:spring', 1)
  emit('update:centripetal', 1)
  emit('forceChange')
}
</script>

<style scoped src="./graph-sidebar.css"></style>
