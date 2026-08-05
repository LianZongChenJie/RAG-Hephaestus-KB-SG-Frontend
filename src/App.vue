<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import ChatSidebar from './components/ChatSidebar.vue'
import ChatWindow from './components/ChatWindow.vue'
import { fetchHealth } from './api/chat'

const ollamaOk = ref(null)

onMounted(async () => {
  try {
    const data = await fetchHealth()
    ollamaOk.value = data.ollama
    if (!data.ollama) {
      ElMessage.warning(data.detail || 'Ollama 未就绪，请先启动 ollama serve 并拉取模型')
    } else if (data.model_ready === false) {
      ElMessage.warning(`未找到 ${data.model}，请确认 ollama list 中已有该模型`)
    }
  } catch {
    ollamaOk.value = false
    ElMessage.warning('无法连接后端，请先启动 backend（端口 8000）')
  }
})
</script>

<template>
  <div class="app-shell">
    <ChatSidebar />
    <ChatWindow />
    <div v-if="ollamaOk === false" class="banner warn">
      Ollama 或后端未连接 — 请检查服务是否已启动
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
* {
  box-sizing: border-box;
}
</style>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  position: relative;
  overflow: hidden;
}
.banner {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 13px;
  padding: 6px;
  pointer-events: none;
}
.banner.warn {
  background: #fdf6ec;
  color: #e6a23c;
}
</style>
