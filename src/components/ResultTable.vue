<script setup>
defineProps({
  columns: {
    type: Array,
    default: () => [],
  },
  rows: {
    type: Array,
    default: () => [],
  },
})
</script>

<template>
  <div class="result-table">
    <div class="result-table__meta">共 {{ rows.length }} 条</div>
    <el-table
      :data="rows"
      border
      stripe
      size="small"
      max-height="360"
      empty-text="暂无数据"
      style="width: 100%"
    >
      <el-table-column
        v-for="col in columns"
        :key="col.key"
        :prop="col.key"
        :label="col.label || col.key"
        :min-width="col.width === 'auto' ? 120 : col.width"
        show-overflow-tooltip
      />
    </el-table>
  </div>
</template>

<style scoped>
.result-table {
  margin-top: 10px;
  width: 100%;
  overflow: hidden;
}
.result-table__meta {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}
</style>
