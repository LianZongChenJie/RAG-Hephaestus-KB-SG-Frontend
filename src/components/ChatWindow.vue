<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import { ElMessage } from 'element-plus'
import { Promotion, VideoPause, Document } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chatStore'
import SettingPanel from './SettingPanel.vue'
import ResultTable from './ResultTable.vue'
import ResultChart from './ResultChart.vue'
import { downloadMarkdownAsPdf, looksLikeMarkdown } from '../utils/markdownToPdf'

const store = useChatStore()
const input = ref('')
const listRef = ref(null)

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
})

const messages = computed(() => store.currentSession?.messages || [])

function isStreamingAssistant(index) {
  return (
    store.isGenerating
    && index === messages.value.length - 1
    && messages.value[index]?.role === 'assistant'
  )
}

/** 依赖 streamTick，确保流式逐字刷新 */
function streamingText(msg) {
  void store.streamTick
  return msg?.content || ''
}

function renderMarkdown(content) {
  if (!content) return ''
  return marked.parse(content)
}

/** 将 msg.table 数据转为 Markdown 表格字符串 */
function tableToMarkdown(table) {
  if (!table?.columns?.length) return ''
  const { columns, rows = [] } = table
  // 表头：取 label
  const header = '| ' + columns.map(c => c.label || c.key).join(' | ') + ' |'
  const separator = '| ' + columns.map(() => '---').join(' | ') + ' |'
  // 数据行
  const dataRows = rows.map(row => {
    const vals = columns.map(col => (row[col] ?? row[columns.indexOf(col)] ?? '') ?? '')
    return '| ' + vals.join(' | ') + ' |'
  })
  return '\n\n' + header + '\n' + separator + '\n' + dataRows.join('\n') + '\n'
}

/** 导出 AI 回复为 PDF（包含文本 + 表格） */
async function downloadPdf(msg, index) {
  const parts = []
  if (msg?.content) parts.push(msg.content)
  if (msg?.table?.columns?.length) {
    // 调试：打印 table 数据结构
    console.log('=== PDF 导出 - Table 数据结构 ===')
    console.log('msg.table:', JSON.stringify(msg.table, null, 2))
    console.log('columns:', msg.table.columns)
    console.log('rows (前3条):', msg.table.rows?.slice(0, 3))
    console.log('rows[0] type:', typeof msg.table.rows?.[0], Array.isArray(msg.table.rows?.[0]))
    if (msg.table.rows?.[0]) {
      console.log('rows[0]:', msg.table.rows[0])
      console.log('rows[0] keys:', Object.keys(msg.table.rows[0]))
    }
    console.log('=====================================')
    parts.push(tableToMarkdown(msg.table))
  }
  if (!parts.length) return
  const filename = store.currentSession?.title || `AI回复_${index + 1}`
  try {
    await downloadMarkdownAsPdf(parts.join('\n\n'), filename)
    ElMessage.success('PDF 已开始下载')
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  }
}

function enhanceCodeBlocks() {
  nextTick(() => {
    const root = listRef.value
    if (!root) return
    root.querySelectorAll('pre code').forEach((block) => {
      const pre = block.parentElement
      if (!pre || pre.querySelector('.copy-code-btn')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'copy-code-btn'
      btn.textContent = '复制'
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(block.textContent || '')
          ElMessage.success('已复制')
        } catch {
          ElMessage.error('复制失败')
        }
      })
      pre.style.position = 'relative'
      pre.appendChild(btn)
    })
  })
}

watch(messages, () => {
  enhanceCodeBlocks()
}, { deep: true })

let scrollRaf = 0
watch(
  () => store.streamTick,
  () => {
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      scrollToBottom()
    })
  },
)

watch(
  () => store.isGenerating,
  (gen, was) => {
    if (was && !gen) {
      nextTick(() => {
        enhanceCodeBlocks()
        scrollToBottom()
      })
    }
  },
)

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function send() {
  const text = input.value
  if (!text.trim() || store.isGenerating) return
  input.value = ''
  await store.sendMessage(text, {
    onError: (msg) => ElMessage.error(msg),
  })
  scrollToBottom()
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function clearInput() {
  input.value = ''
}

const SUGGEST_TAGS = [
  { label: '设备信息', prompt: '请查看并介绍设备信息' },
  { label: '设备统计', prompt: '设备统计' },
  { label: '告警分析', prompt: '告警分析' },
  { label: '场馆信息', prompt: '场馆信息' },
  { label: '停车数据', prompt: '停车数据' },
  { label: '照明管理', prompt: '照明管理' },
  { label: 'AI报告', prompt: 'AI报告' }
]

async function useSuggest(tag) {
  if (store.isGenerating) return
  input.value = ''
  await store.sendMessage(tag.prompt, {
    onError: (msg) => ElMessage.error(msg),
  })
  scrollToBottom()
}

function onMediaChange(e) {
  store.setSidebarCollapsed(e.matches)
}

let mq
onMounted(() => {
  mq = window.matchMedia('(max-width: 768px)')
  store.setSidebarCollapsed(mq.matches)
  mq.addEventListener('change', onMediaChange)
  enhanceCodeBlocks()
})

onUnmounted(() => {
  mq?.removeEventListener('change', onMediaChange)
})
</script>

<template>
  <main class="chat-main">
    <header class="chat-header">
      <span class="title">{{ store.currentSession?.title || 'AI 对话' }}</span>
      <!--<SettingPanel />-->
    </header>

    <div ref="listRef" class="message-list">
      <div v-if="!messages.length" class="empty">
        <p>有什么我能帮你的吗？</p>
        <p class="hint">我是 Hephaestus，支持多轮上下文。Enter 发送，Shift+Enter 换行</p>
        <p class="suggest-label">试试这些快捷查询</p>
        <div class="suggest-tags">
          <button
            v-for="tag in SUGGEST_TAGS"
            :key="tag.label"
            type="button"
            class="suggest-tag"
            :disabled="store.isGenerating"
            @click="useSuggest(tag)"
          >{{ tag.label }}</button>
        </div>
      </div>

      <div
        v-for="(msg, index) in messages"
        :key="index"
        class="message-row"
        :class="msg.role"
      >
        <div class="bubble" :class="{ wide: msg.table || msg.chart }">
          <div v-if="msg.role === 'assistant'" class="role-label">AI</div>

          <div
            v-if="msg.role === 'assistant' && msg.status && isStreamingAssistant(index)"
            class="status-text"
          >{{ msg.status }}</div>

          <div
            v-if="msg.role === 'assistant' && msg.sql"
            class="sql-block"
          >
            <div class="sql-label">SQL</div>
            <pre><code>{{ msg.sql }}</code></pre>
          </div>

          <div
            v-if="msg.role === 'user'"
            class="user-text"
          >{{ msg.content }}</div>

          <ResultTable
            v-if="msg.role === 'assistant' && msg.table?.columns?.length"
            :columns="msg.table.columns"
            :rows="msg.table.rows || []"
          />

          <ResultChart
            v-if="msg.role === 'assistant' && msg.chart?.option"
            :chart-id="msg.chart.chartId"
            :option="msg.chart.option"
          />

          <div
            v-if="msg.role === 'assistant' && isStreamingAssistant(index) && msg.content"
            class="stream-text"
          >{{ streamingText(msg) }}<span class="stream-cursor" aria-hidden="true" /></div>
          <div
            v-else-if="msg.role === 'assistant' && msg.content"
            class="md-body-wrap"
          >
            <button
              class="pdf-btn"
              title="导出为 PDF"
              :disabled="store.isGenerating"
              @click="downloadPdf(msg, index)"
            >
              <el-icon><Document /></el-icon>
              导出 PDF
            </button>
            <div class="md-body" v-html="renderMarkdown(msg.content)" />
          </div>

          <div
            v-if="msg.role === 'assistant' && store.isGenerating && index === messages.length - 1 && !msg.content && !msg.table && !msg.chart"
            class="typing"
          >
            <span /><span /><span />
          </div>
        </div>
      </div>
    </div>

    <footer class="composer">
      <el-input
        v-model="input"
        type="textarea"
        :rows="3"
        placeholder="输入消息…"
        resize="none"
        :disabled="store.isGenerating"
        @keydown="onKeydown"
      />
      <div class="composer-actions">
        <el-button text size="small" :disabled="store.isGenerating" @click="clearInput">
          清空
        </el-button>
        <el-button
          v-if="store.isGenerating"
          type="warning"
          @click="store.stopGenerating()"
        >
          <el-icon><VideoPause /></el-icon>
          停止生成
        </el-button>
        <el-button
          v-else
          type="primary"
          :disabled="!input.trim()"
          @click="send"
        >
          <el-icon><Promotion /></el-icon>
          发送
        </el-button>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.chat-header .title {
  font-weight: 600;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px 12px;
}
.empty {
  text-align: center;
  color: #909399;
  margin-top: 15vh;
}
.empty .hint {
  font-size: 13px;
  margin-top: 8px;
}
.suggest-label {
  margin: 28px 0 12px;
  font-size: 13px;
  color: #c0c4cc;
}
.suggest-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.suggest-tag {
  appearance: none;
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #409eff;
  font-size: 13px;
  line-height: 1;
  padding: 10px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.suggest-tag:hover:not(:disabled) {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
}
.suggest-tag:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.message-row {
  display: flex;
  margin-bottom: 16px;
}
.message-row.user {
  justify-content: flex-end;
}
.message-row.assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: min(720px, 88%);
  padding: 12px 14px;
  border-radius: 12px;
  line-height: 1.6;
  font-size: 15px;
}
.bubble.wide {
  max-width: min(960px, 96%);
}
.message-row.user .bubble {
  background: #409eff;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.message-row.assistant .bubble {
  background: #f4f4f5;
  color: #303133;
  border-bottom-left-radius: 4px;
}
.role-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}
.status-text {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}
.sql-block {
  margin-bottom: 10px;
  background: #1e1e1e;
  color: #dcdcdc;
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
}
.sql-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}
.sql-block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}
.user-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.stream-text {
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.2em;
  margin-top: 10px;
}
.md-body {
  margin-top: 10px;
}
.md-body-wrap {
  position: relative;
  margin-top: 10px;
}
.pdf-btn {
  position: absolute;
  top: -2px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  appearance: none;
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #606266;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 1;
}
.pdf-btn:hover:not(:disabled) {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}
.pdf-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: #409eff;
  animation: cursor-pulse 0.9s step-end infinite;
}
@keyframes cursor-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.composer {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 12px 16px 16px;
  background: #fafafa;
}
.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.typing {
  display: flex;
  gap: 4px;
  padding-top: 8px;
}
.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #909399;
  animation: blink 1.2s infinite;
}
.typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}
</style>

<style>
/* Markdown 全局（v-html） */
.md-body pre {
  position: relative;
  background: #1e1e1e;
  color: #dcdcdc;
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}
.md-body code {
  font-family: Consolas, Monaco, monospace;
  font-size: 13px;
}
.md-body :not(pre) > code {
  background: #eee;
  padding: 2px 6px;
  border-radius: 4px;
}
.copy-code-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 12px;
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
.copy-code-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
