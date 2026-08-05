import { defineStore } from 'pinia'
import { streamChat } from '../api/chat'
import { createTypewriter } from '../utils/typewriterQueue'

// localStorage 键名
const STORAGE_KEY = 'hephaestus_chat_v1'
const SAVE_DEBOUNCE_MS = 400

function uuid() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function defaultSession() {
  const now = Date.now()
  return {
    id: uuid(),
    title: '新对话',
    messages: [],
    updatedAt: now,
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const useChatStore = defineStore('chat', {
  state: () => {
    const defaultSettings = { temperature: 0.6, num_ctx: 2048 }
    const saved = loadPersisted()
    const sessions = saved?.sessions?.length ? saved.sessions : [defaultSession()]
    const mergedSettings = saved?.settings
      ? { ...defaultSettings, ...saved.settings }
      : defaultSettings
    return {
      sessions,
      currentSessionId: saved?.currentSessionId || sessions[0].id,
      settings: mergedSettings,
      isGenerating: false,
      /** 流式输出时递增，供界面滚动等轻量刷新 */
      streamTick: 0,
      sidebarCollapsed: false,
      _abortController: null,
      _saveTimer: null,
    }
  },

  getters: {
    currentSession(state) {
      return state.sessions.find((s) => s.id === state.currentSessionId) || state.sessions[0]
    },
  },

  actions: {
    persist() {
      clearTimeout(this._saveTimer)
      this._saveTimer = setTimeout(() => {
        const payload = {
          sessions: this.sessions,
          currentSessionId: this.currentSessionId,
          settings: this.settings,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      }, SAVE_DEBOUNCE_MS)
    },

    createSession() {
      const s = defaultSession()
      this.sessions.unshift(s)
      this.currentSessionId = s.id
      this.persist()
    },

    selectSession(id) {
      this.currentSessionId = id
      this.persist()
    },

    deleteSession(id) {
      const idx = this.sessions.findIndex((s) => s.id === id)
      if (idx === -1) return
      this.sessions.splice(idx, 1)
      if (!this.sessions.length) {
        const s = defaultSession()
        this.sessions.push(s)
        this.currentSessionId = s.id
      } else if (this.currentSessionId === id) {
        this.currentSessionId = this.sessions[0].id
      }
      this.persist()
    },

    updateSettings(partial) {
      this.settings = { ...this.settings, ...partial }
      this.persist()
    },

    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },

    setSidebarCollapsed(collapsed) {
      this.sidebarCollapsed = collapsed
    },

    _touchSession(session) {
      session.updatedAt = Date.now()
    },

    _maybeSetTitle(session, userText) {
      if (session.title === '新对话' || !session.title) {
        const t = userText.trim().slice(0, 24)
        session.title = t || `对话 ${new Date().toLocaleString()}`
      }
    },

    stopGenerating() {
      this._abortController?.abort()
      this._abortController = null
      const tw = this._typewriter
      if (tw) {
        this._typewriter = null
        tw.cancel(() => {
          this.isGenerating = false
          this.persist()
        })
      } else {
        this.isGenerating = false
      }
    },

    async sendMessage(userText, { onError } = {}) {
      const text = userText.trim()
      if (!text || this.isGenerating) return false

      const session = this.currentSession
      if (!session) return false

      session.messages.push({ role: 'user', content: text })
      this._maybeSetTitle(session, text)
      this._touchSession(session)
      this.persist()

      // 必须通过 messages 数组下标改 content，才能触发 Vue 响应式流式刷新
      session.messages.push({ role: 'assistant', content: '' })
      const assistantIndex = session.messages.length - 1

      this.isGenerating = true
      this._abortController = new AbortController()

      const typewriter = createTypewriter({
        onUpdate: (displayed) => {
          const msg = session.messages[assistantIndex]
          if (msg) msg.content = displayed
          this.streamTick += 1
        },
        charsPerTick: 2,
        tickMs: 16,
      })
      this._typewriter = typewriter

      const messagesForApi = session.messages
        .slice(0, -1)
        .map(({ role, content }) => ({ role, content }))

      await streamChat({
        messages: messagesForApi,
        temperature: this.settings.temperature,
        num_ctx: this.settings.num_ctx,
        signal: this._abortController.signal,
        onToken: (chunk) => {
          typewriter.push(chunk)
        },
        onDone: () => {
          const tw = this._typewriter
          if (!tw) return
          tw.finish(() => {
            this._typewriter = null
            this.isGenerating = false
            this._abortController = null
            const msg = session.messages[assistantIndex]
            if (msg && !msg.content.trim()) {
              msg.content = '（已停止或无内容返回）'
            }
            this._touchSession(session)
            this.persist()
          })
        },
        onError: (errMsg) => {
          const tw = this._typewriter
          if (!tw) return
          tw.finish(() => {
            this._typewriter = null
            this.isGenerating = false
            this._abortController = null
            const msg = session.messages[assistantIndex]
            if (msg) {
              msg.content = msg.content || `错误：${errMsg}`
            }
            onError?.(errMsg)
            this._touchSession(session)
            this.persist()
          })
        },
      })

      return true
    },
  },
})
