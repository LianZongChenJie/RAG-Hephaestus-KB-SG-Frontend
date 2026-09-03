<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  chartId: {
    type: String,
    default: '',
  },
  option: {
    type: Object,
    default: () => ({}),
  },
})

const elRef = ref(null)
let chart = null
let resizeObserver = null

function render() {
  if (!elRef.value || !props.option || !Object.keys(props.option).length) return
  if (!chart) {
    chart = echarts.init(elRef.value)
  }
  chart.setOption(props.option, true)
  chart.resize()
}

onMounted(() => {
  nextTick(() => {
    render()
    if (elRef.value && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => chart?.resize())
      resizeObserver.observe(elRef.value)
    }
  })
  window.addEventListener('resize', onWinResize)
})

function onWinResize() {
  chart?.resize()
}

watch(
  () => props.option,
  () => nextTick(render),
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWinResize)
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="result-chart">
    <div :id="chartId || undefined" ref="elRef" class="result-chart__canvas" />
  </div>
</template>

<style scoped>
.result-chart {
  margin-top: 12px;
  width: 100%;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  padding: 8px;
}
.result-chart__canvas {
  width: 100%;
  height: 320px;
}
</style>
