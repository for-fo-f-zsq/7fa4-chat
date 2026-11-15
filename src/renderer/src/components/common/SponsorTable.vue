<template>
  <table v-if="sponsors.length" class="sponsor-table">
    <thead>
      <tr>
        <th>#</th>
        <th>昵称</th>
        <th>金额</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(sp, idx) in sponsors" :key="idx">
        <td class="sponsor-idx">{{ idx + 1 }}</td>
        <td class="sponsor-name">{{ sp.name }}</td>
        <td class="sponsor-amount">{{ sp.amount }}</td>
      </tr>
    </tbody>
  </table>
  <UiEmptyState v-else-if="showEmpty" size="sm" icon="fa-heart" title="暂无赞助记录" description="期待你成为第一位支持者" />
</template>

<script setup>
import { UiEmptyState } from '@/ui'

defineProps({
  sponsors: { type: Array, default: () => [] },
  showEmpty: { type: Boolean, default: true },
})
</script>

<style scoped src="../../css/components/donate-shared.css"></style>
