<template>
  <div class="tools-page">
    <template v-if="currentTool === 'list'">
      <div class="tools-header">
        <h2><i class="fas fa-toolbox"></i> 工具</h2>
      </div>
      <div class="tools-grid">
        <div class="tool-card" @click="$emit('openTool', 'ide')">
          <i class="fas fa-wrench"></i>
          <div class="tool-card-name">IDE</div>
          <div class="tool-card-desc">文件浏览与管理；Monaco 代码编辑；Markdown 编辑/预览/导出；图片编辑；PDF 阅读；C++ 本地编译判题</div>
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
    <template v-else-if="currentTool === 'ide'">
      <IdeTool class="ide-host" @back="$emit('openTool', 'list')" />
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
import IdeTool from './ide/IdeTool.vue'
import GraphTool from './graph/GraphTool.vue'
import CalculatorTool from './calculator/CalculatorTool.vue'

defineProps({
  currentTool: { type: String, default: 'list' }
})

defineEmits(['openTool'])
</script>
