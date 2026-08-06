<template>
  <div class="tools-page">
    <template v-if="currentTool === 'list'">
      <div class="tools-header">
        <h2><i class="fas fa-toolbox"></i> 工具</h2>
      </div>
      <div class="tools-grid">
        <div class="tool-card" @click="$emit('openTool', 'markdown')">
          <i class="fas fa-file-alt"></i>
          <div class="tool-card-name">Markdown 编辑</div>
          <div class="tool-card-desc">Markdown 编写与预览；打开文件 / 新建 / 保存到文件 / 导出为图片</div>
        </div>
        <div class="tool-card" @click="$emit('openTool', 'image')">
          <i class="fas fa-paint-brush"></i>
          <div class="tool-card-name">图片编辑</div>
          <div class="tool-card-desc">画笔/橡皮/直线/矩形/椭圆；撤销；新建画布；保存到文件</div>
        </div>
        <div class="tool-card" @click="$emit('openTool', 'graph_editor')">
          <i class="fas fa-project-diagram"></i>
          <div class="tool-card-name">Graph Editor</div>
          <div class="tool-card-desc">交互式图编辑器：点击建点、拖拽连边、力导向布局、连通分量/桥/MST/二分图高亮</div>
        </div>
        <div class="tool-card" @click="$emit('openTool', 'calculator')">
          <i class="fas fa-calculator"></i>
          <div class="tool-card-name">计算器</div>
          <div class="tool-card-desc">科学计算器：表达式求值、阶乘、快速幂、对数、组合排列、gcd/lcm、质因数分解、模逆元</div>
        </div>
      </div>
    </template>
    <template v-else-if="currentTool === 'markdown'">
      <MarkdownTool
        ref="markdownToolRef"
        class="ide-host"
        @back="$emit('openTool', 'list')"
        @dirty-change="$emit('dirty-change', $event)"
      />
    </template>
    <template v-else-if="currentTool === 'image'">
      <ImageTool
        ref="imageToolRef"
        class="ide-host"
        @back="$emit('openTool', 'list')"
        @dirty-change="$emit('dirty-change', $event)"
      />
    </template>
    <template v-else-if="currentTool === 'graph_editor'">
      <GraphTool class="ide-host" @back="$emit('openTool', 'list')" />
    </template>
    <template v-else-if="currentTool === 'calculator'">
      <CalculatorTool class="ide-host" @back="$emit('openTool', 'list')" />
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import MarkdownTool from './MarkdownTool.vue'
import ImageTool from './ImageTool.vue'
import GraphTool from './graph/GraphTool.vue'
import CalculatorTool from './calculator/CalculatorTool.vue'

defineProps({
  currentTool: { type: String, default: 'list' }
})

const emit = defineEmits(['openTool', 'dirty-change'])

const imageToolRef = ref(null)
const markdownToolRef = ref(null)

// 供父级在切换页面时调用（未保存拦截：保存后再离开）
defineExpose({
  imageSave: () => imageToolRef.value?.save(),
  markdownSave: () => markdownToolRef.value?.save()
})
</script>
