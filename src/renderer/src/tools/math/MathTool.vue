<template>
  <div class="math-official">
    <div class="math-official-header">
      <button class="math-official-back" title="返回工具列表" @click="$emit('back')">
        <i class="fas fa-arrow-left"></i>
      </button>
      <span class="math-official-title">
        <i class="fas fa-chart-line"></i> 工具 <span class="math-official-sep">/</span> GeoGebra
      </span>
      <span class="math-official-note" v-if="!loaded">本地离线版启动中…</span>
    </div>
    <div class="math-official-body">
      <iframe
        ref="frameRef"
        class="math-official-frame"
        src="geo://ggb/calculator.html"
        frameborder="0"
        allowfullscreen
        @load="onLoad"
      ></iframe>
      <div v-if="!loaded" class="math-official-loading">
        <i class="fas fa-spinner fa-spin"></i> 正在启动 GeoGebra 绘图计算器（本地离线版）…
        <div class="math-official-loading-sub">
          支持函数/极坐标/参数/隐式曲线、几何构造、滑动条动画、测量、变换、轨迹、CAS 等全部二维功能，完全离线可用
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import './math-official.css'

const emit = defineEmits(['back', 'dirty-change'])

const frameRef = ref(null)
const loaded = ref(false)

function onLoad() {
  loaded.value = true
  // 官方版内部状态由 GeoGebra 管理，无需 dirty 拦截
  emit('dirty-change', false)
}

/** 供未保存拦截调用：官方版保存由 GeoGebra 菜单导出图片完成，此处无操作 */
async function save() {
  emit('dirty-change', false)
}

defineExpose({ save })
</script>
