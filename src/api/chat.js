/**
 * 对话 API：SSE 流式（fetch + ReadableStream），健康检查（axios）。
 */

import axios from 'axios'

/** 流式接口：开发环境直连 8000，避免 Vite proxy 缓冲整段 SSE */
function streamChatUrl() {
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:8000/api/chat-stream`
  }
  return '/api/chat-stream'
}

function apiPrefix() {
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:8000/api`
  }
  return '/api'
}

/**
 * @param {object} params
 * @param {(chunk: string) => void} params.onToken
 */
export async function streamChat({
  messages,
  temperature,
  num_ctx,
  signal,
  onToken,
  onDone,
  onError,
}) {
  let response
  try {
    response = await fetch(streamChatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature, num_ctx }),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone?.()
      return
    }
    onError?.('网络请求失败，请检查后端是否已启动')
    return
  }

  if (!response.ok) {
    const text = await response.text()
    onError?.(text || `请求失败 (${response.status})`)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError?.('浏览器不支持流式读取')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  const handleEvent = (payload) => {
    if (payload.error) {
      onError?.(payload.error)
      return 'error'
    }
    if (payload.done) {
      onDone?.()
      return 'done'
    }
    if (payload.content) {
      onToken(payload.content)
    }
    return 'ok'
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        const raw = line.slice(5).trim()
        if (!raw) continue
        let payload
        try {
          payload = JSON.parse(raw)
        } catch {
          continue
        }
        const status = handleEvent(payload)
        if (status === 'error' || status === 'done') return
      }
    }
    onDone?.()
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone?.()
      return
    }
    onError?.(err.message || '流式读取中断')
  } finally {
    reader.releaseLock()
  }
}

export async function fetchHealth() {
  const { data } = await axios.get(`${apiPrefix()}/health`, { timeout: 8000 })
  return data
}
