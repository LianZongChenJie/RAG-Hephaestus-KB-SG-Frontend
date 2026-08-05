<script setup>
import { useChatStore } from '../stores/chatStore'

const store = useChatStore()
</script>

<template>
  <el-collapse class="setting-collapse">
    <el-collapse-item title="模型参数（Qwen 9B 极速）" name="settings">
      <div class="row">
        <span class="label">Temperature</span>
        <el-slider
          v-model="store.settings.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          show-input
          :show-input-controls="false"
          @change="store.updateSettings({ temperature: store.settings.temperature })"
        />
      </div>
      <div class="row">
        <span class="label">上下文长度 num_ctx</span>
        <el-input-number
          v-model="store.settings.num_ctx"
          :min="512"
          :max="8192"
          :step="512"
          @change="store.updateSettings({ num_ctx: store.settings.num_ctx })"
        />
      </div>
      <p class="tip">
        固定 qwen3.5:9b + GPU；仅本服务使用，请先 ollama stop qwen3.5:27b。缩短 num_ctx 可加快首字。
      </p>
    </el-collapse-item>
  </el-collapse>
</template>

<style scoped>
.setting-collapse {
  border: none;
  max-width: 320px;
}
.setting-collapse :deep(.el-collapse-item__header) {
  border: none;
  font-size: 13px;
  color: #606266;
  height: 36px;
}
.setting-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}
.row {
  margin-bottom: 12px;
}
.label {
  display: block;
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
}
.tip {
  font-size: 12px;
  color: #909399;
  margin: 0;
}
</style>
