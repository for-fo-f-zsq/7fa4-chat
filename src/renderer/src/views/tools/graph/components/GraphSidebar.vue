<template>
  <div class="graph-sidebar-root">
    <UiTabs
      v-model="activeTab"
      :items="SIDEBAR_TABS"
      variant="line"
      size="sm"
      class="graph-sidebar-tabs"
    >
      <!-- Tab 1: 图结构与分析（边列表 + 节点点权 + 随机生成 + 算法分析） -->
      <div v-if="activeTab === 'structure'" class="graph-tab-panel">
        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-file-alt" aria-hidden="true"></i>
            <span>边列表</span>
            <span class="graph-block-hint">实时生效</span>
          </div>

          <UiTextarea
            :model-value="inputText"
            :rows="7"
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
            <i class="fas fa-weight-hanging" aria-hidden="true"></i>
            <span>节点点权</span>
            <span class="graph-block-hint">数字 · 可选</span>
          </div>
          <UiTextarea
            :model-value="weightsText"
            :rows="3"
            spellcheck="false"
            aria-label="节点点权"
            placeholder="5&#10;_&#10;-2"
            @update:model-value="$emit('inputWeights', $event)"
          />
          <p class="graph-help">每行对应一个节点的数字点权，<code>_</code> 或留空表示无点权；圆内始终保留编号。</p>
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

          <p v-if="highlight === 'none'" class="graph-help">
            选择一种分析算法后，画布将高亮对应结构并在下方展示明细。
          </p>
        </section>

        <section v-if="highlight !== 'none'" class="graph-analysis" :data-status="analysis.status">
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

      <!-- Tab 2: 物理布局参数 -->
      <div v-else-if="activeTab === 'physics'" class="graph-tab-panel">
        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-sliders" aria-hidden="true"></i>
            <span>力学参数（Velocity-Verlet）</span>
            <span class="graph-block-hint">即时生效</span>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">保守排斥强度</span>
              <span class="graph-param-val">{{ repulsion.toFixed(1) }}x</span>
            </div>
            <UiSlider
              :model-value="repulsion"
              :min="0.1"
              :max="5"
              :step="0.1"
              :show-value="false"
              size="sm"
              aria-label="保守排斥强度"
              @update:model-value="$emit('update:repulsion', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">软化平方反比排斥力，严格满足牛顿第三定律。</p>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">默认弹簧劲度 k</span>
              <span class="graph-param-val">{{ stiffness.toFixed(1) }}</span>
            </div>
            <UiSlider
              :model-value="stiffness"
              :min="0.1"
              :max="5"
              :step="0.1"
              :show-value="false"
              size="sm"
              aria-label="默认弹簧劲度"
              @update:model-value="$emit('update:stiffness', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">胡克弹力 F = kₑ(d - Lₑ)û，未单独设置的边使用此值。</p>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">默认弹簧原长 L₀</span>
              <span class="graph-param-val">{{ Math.round(restLength) }} px</span>
            </div>
            <UiSlider
              :model-value="restLength"
              :min="40"
              :max="300"
              :step="5"
              :show-value="false"
              size="sm"
              aria-label="默认弹簧原长"
              @update:model-value="$emit('update:restLength', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">边弹簧平衡距离，可在画布或下方按单边覆盖。</p>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">粘性阻尼 γ</span>
              <span class="graph-param-val">{{ damping === 0 ? '0（守恒）' : damping.toFixed(1) }}</span>
            </div>
            <UiSlider
              :model-value="damping"
              :min="0"
              :max="5"
              :step="0.1"
              :show-value="false"
              size="sm"
              aria-label="粘性阻尼系数"
              @update:model-value="$emit('update:damping', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">阻力 -γv；设为 0 时动量与总机械能严格守恒。</p>
          </div>

          <div class="graph-param">
            <div class="graph-param-head">
              <span class="graph-param-label">时间步长 dt</span>
              <span class="graph-param-val">{{ dt.toFixed(3) }}</span>
            </div>
            <UiSlider
              :model-value="dt"
              :min="0.005"
              :max="0.08"
              :step="0.005"
              :show-value="false"
              size="sm"
              aria-label="积分时间步长"
              @update:model-value="$emit('update:dt', $event)"
              @change="$emit('forceChange')"
            />
            <p class="graph-help">保辛积分步长，越小数值能量漂移越低。</p>
          </div>

          <div class="graph-switch-row">
            <UiSwitch
              :model-value="autoCenter"
              size="sm"
              label="布局时视角追踪质心（不施加外力）"
              @update:model-value="$emit('update:autoCenter', $event)"
            />
          </div>

          <div class="graph-btn-row">
            <UiButton
              size="sm"
              variant="secondary"
              icon="fas fa-crosshairs"
              title="平移视角使系统质心居中"
              @click="$emit('centerCom')"
            >
              质心居中
            </UiButton>
            <UiButton
              size="sm"
              variant="secondary"
              icon="fas fa-rotate-left"
              title="重置所有物理模拟参数为默认值"
              @click="$emit('resetPhysics')"
            >
              恢复默认
            </UiButton>
          </div>
        </section>

        <section v-if="selectedEdge" class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-link" aria-hidden="true"></i>
            <span>选中边弹簧（{{ selectedEdge.u }} — {{ selectedEdge.v }}）</span>
          </div>
          <div class="graph-field-grid">
            <label class="graph-field-cell">
              <span class="graph-field-label">原长 Lₑ (px)</span>
              <UiInput
                type="number"
                size="sm"
                :model-value="selectedEdge.restLength ?? ''"
                :placeholder="`默认 ${Math.round(restLength)}`"
                aria-label="选中边原长"
                @update:model-value="onEdgePhysicsInput('restLength', $event)"
              />
            </label>
            <label class="graph-field-cell">
              <span class="graph-field-label">劲度 kₑ</span>
              <UiInput
                type="number"
                size="sm"
                :model-value="selectedEdge.stiffness ?? ''"
                :placeholder="`默认 ${stiffness.toFixed(1)}`"
                aria-label="选中边劲度"
                @update:model-value="onEdgePhysicsInput('stiffness', $event)"
              />
            </label>
          </div>
          <UiButton
            size="sm"
            variant="secondary"
            icon="fas fa-undo"
            block
            @click="$emit('updateEdgePhysics', selectedEdge, { restLength: '', stiffness: '' })"
          >
            恢复跟随全局默认
          </UiButton>
        </section>

        <section class="graph-block">
          <div class="graph-block-head">
            <i class="fas fa-atom" aria-hidden="true"></i>
            <span>守恒量监测</span>
            <span class="graph-block-hint">{{ damping === 0 ? '零阻力守恒' : '阻尼收敛' }}</span>
          </div>
          <div class="graph-metrics">
            <div class="graph-metric">
              <span class="graph-metric__k">总能量 E</span>
              <span class="graph-metric__v">{{ fmtStat(physicsStats.totalEnergy) }}</span>
            </div>
            <div class="graph-metric">
              <span class="graph-metric__k">动能 T</span>
              <span class="graph-metric__v">{{ fmtStat(physicsStats.kineticEnergy) }}</span>
            </div>
            <div class="graph-metric">
              <span class="graph-metric__k">势能 V</span>
              <span class="graph-metric__v">{{ fmtStat(physicsStats.potentialEnergy) }}</span>
            </div>
            <div class="graph-metric">
              <span class="graph-metric__k">总动量 |P|</span>
              <span class="graph-metric__v">{{ fmtStat(physicsStats.momentumNorm, 4) }}</span>
            </div>
          </div>
        </section>
      </div>
    </UiTabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { UiDropdown, UiButton, UiInput, UiSlider, UiSwitch, UiTextarea, UiTabs } from '@/ui'
import { OFFSET_OPTIONS, RAND_MODE_OPTIONS, HIGHLIGHT_OPTIONS } from '../graphConstants.js'

const props = defineProps({
  inputText: { type: String, required: true },
  weightsText: { type: String, required: true },
  offset: { type: Number, required: true },
  randMode: { type: String, required: true },
  randN: { type: Number, required: true },
  randM: { type: Number, required: true },
  randWeighted: { type: Boolean, required: true },
  repulsion: { type: Number, required: true },
  stiffness: { type: Number, required: true },
  restLength: { type: Number, required: true },
  damping: { type: Number, required: true },
  dt: { type: Number, required: true },
  autoCenter: { type: Boolean, required: true },
  physicsStats: {
    type: Object,
    default: () => ({ kineticEnergy: 0, potentialEnergy: 0, totalEnergy: 0, momentumNorm: 0 })
  },
  selectedEdge: { type: Object, default: null },
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
  'inputWeights',
  'update:offset',
  'loadExample',
  'clearInput',
  'update:randMode',
  'update:randN',
  'update:randM',
  'update:randWeighted',
  'randomGraph',
  'update:repulsion',
  'update:stiffness',
  'update:restLength',
  'update:damping',
  'update:dt',
  'update:autoCenter',
  'forceChange',
  'resetPhysics',
  'centerCom',
  'updateEdgePhysics',
  'update:highlight',
  'update:algoSrc',
  'update:algoSink'
])

const activeTab = ref('structure')

const SIDEBAR_TABS = [
  { key: 'structure', label: '图结构与分析', icon: 'fas fa-sitemap' },
  { key: 'physics', label: '物理布局', icon: 'fas fa-sliders-h' }
]

const STATUS_TEXT = { ok: '完成', warn: '提示', error: '无法计算', info: '结果' }

function onEdgePhysicsInput(field, val) {
  if (!props.selectedEdge) return
  emit('updateEdgePhysics', props.selectedEdge, { [field]: val })
  emit('forceChange')
}

function fmtStat(v, digits = 2) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return Math.abs(n) < 1e-6 ? '0' : n.toFixed(digits)
}
</script>

<style scoped src="./graph-sidebar.css"></style>
