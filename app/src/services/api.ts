import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { ApiResponse, ChatSession, ChatMessage, ResearchSession, ResearchMessage, Document, StartSessionRequest, StreamLessonRequest, TeacherEvent, RenderErrorReport } from '../types'

// Create axios instance with default configuration
// Normalize baseURL to ensure it always includes `/api` to match server controllers
const rawBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api'
const normalizedBaseUrl = (() => {
  const trimmed = rawBaseUrl.replace(/\/$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
})()

const api: AxiosInstance = axios.create({
  baseURL: normalizedBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    // Try WorkOS access token first, fallback to legacy authToken
    const token = localStorage.getItem('workos_access_token') || localStorage.getItem('authToken')
    console.log('🔍 Debug - API Request:', {
      url: config.url,
      method: config.method,
      hasToken: !!token,
      tokenLength: token?.length || 0
    })
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for handling common errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log('🔍 Debug - API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    })
    return response
  },
  (error) => {
    console.log('🔍 Debug - API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    })
    if (error.response?.status === 401) {
      // Handle unauthorized access - clear all auth tokens
      localStorage.removeItem('authToken')
      localStorage.removeItem('workos_session_token')
      localStorage.removeItem('workos_access_token')
      localStorage.removeItem('workos_refresh_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Generic API methods
export const apiService = {
  // GET request
  async get<T>(url: string, params?: any): Promise<ApiResponse<T>> {
    try {
      const response = await api.get(url, { params })
      console.log('🔍 Debug - API Service GET response:', {
        url,
        status: response.status,
        data: response.data
      })
      return response.data
    } catch (error: any) {
      console.log('🔍 Debug - API Service GET error:', {
        url,
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      })
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // Auth profile (for sensible defaults when customization is empty)
  async getProfile(): Promise<ApiResponse<{ id: string; email: string; fullName: string }>> {
    try {
      const response = await api.get('/auth/profile')
      return { success: true, data: response.data }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message }
    }
  },

  // POST request
  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response = await api.post(url, data)
      return response.data
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // PUT request
  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response = await api.put(url, data)
      return response.data
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // DELETE request
  async delete<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await api.delete(url)
      return response.data
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // Chat Sessions API methods
  async listChatSessions(userId: string, limit: number = 20): Promise<ApiResponse<ChatSession[]>> {
    try {
      const response = await api.get(`/chat/sessions?userId=${userId}&limit=${limit}`)
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  async getChatMessages(sessionId: string, limit: number = 100): Promise<ApiResponse<ChatMessage[]>> {
    try {
      const response = await api.get(`/chat/sessions/${sessionId}/messages?limit=${limit}`)
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  async upsertChatSession(sessionData: Partial<ChatSession>): Promise<ApiResponse<ChatSession>> {
    try {
      const response = await api.post('/chat/sessions', sessionData)
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // Research Sessions API methods
  async listResearchSessions(userId: string, limit: number = 20): Promise<ApiResponse<ResearchSession[]>> {
    try {
      const response = await api.get(`/research/sessions?userId=${userId}&limit=${limit}`)
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  async getResearchMessages(sessionId: string, limit: number = 200): Promise<ApiResponse<ResearchMessage[]>> {
    try {
      const response = await api.get(`/research/sessions/${sessionId}/messages?limit=${limit}`)
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  async upsertResearchSession(sessionData: Partial<ResearchSession>): Promise<ApiResponse<ResearchSession>> {
    try {
      const response = await api.post('/research/sessions', sessionData)
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // Document API methods
  async getUserDocuments(userId: string): Promise<ApiResponse<Document[]>> {
    try {
      const response = await api.get(`/documents/user/${userId}`)
      return {
        success: response.data.success,
        data: response.data.documents || []
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // Q&A API methods
  async askQuestion(question: string, context: any, sessionId: string, userId: string): Promise<ApiResponse<any>> {
    try {
      const response = await api.post('/agents/qna/ask', {
        question,
        context,
        sessionId,
        userId
      })
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },
  
  // Q&A Streaming (NDJSON via fetch for readable stream)
  async streamQuestion(params: {
    question: string;
    context: any;
    sessionId: string;
    userId: string;
    preferredProvider?: string;
    onEvent: (evt: { type: string; [key: string]: any }) => void;
    onError?: (error: Error) => void;
    onDone?: () => void;
  }): Promise<void> {
    const { question, context, sessionId, userId, preferredProvider, onEvent, onError, onDone } = params
    try {
      const url = `${api.defaults.baseURL?.replace(/\/$/, '') || ''}/agents/qna/ask/stream`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/plain; charset=utf-8',
      }
      const token = localStorage.getItem('workos_access_token') || localStorage.getItem('authToken')
      if (token) headers['Authorization'] = `Bearer ${token}`

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: question,
          context,
          sessionId,
          userId,
          preferredProvider,
        }),
      })
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Stream failed (${resp.status}): ${text}`)
      }

      const reader = (resp.body as any).getReader?.()
      if (!reader) {
        const text = await resp.text()
        // Try to parse as single JSON or emit as final content
        try {
          const obj = JSON.parse(text)
          onEvent(obj)
        } catch {
          onEvent({ type: 'content', content: text })
        }
        onEvent({ type: 'done' })
        onDone?.()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // split by newlines for NDJSON
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const evt = JSON.parse(trimmed)
            onEvent(evt)
          } catch (e) {
            // Fallback: treat as content delta
            onEvent({ type: 'content', delta: trimmed })
          }
        }
      }
      if (buffer.trim()) {
        try {
          onEvent(JSON.parse(buffer.trim()))
        } catch {
          onEvent({ type: 'content', delta: buffer.trim() })
        }
      }
      onEvent({ type: 'done' })
      onDone?.()
    } catch (err: any) {
      onError?.(err)
      throw err
    }
  },

  // Ingest a focused document for Q&A grounding
  async ingestDocument(params: {
    userId: string;
    docId: string;
    documentUrl?: string;
    documentTitle?: string;
  }): Promise<ApiResponse<any>> {
    try {
      // Use fetch with a shorter timeout-like behavior; treat timeouts as background success
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      const token = localStorage.getItem('workos_access_token') || localStorage.getItem('authToken')
      if (token) headers['Authorization'] = `Bearer ${token}`

      const resp = await fetch(`${api.defaults.baseURL?.replace(/\/$/, '') || ''}/agents/qna/ingest`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` }
      }
      const data = await resp.json().catch(() => ({}))
      return { success: true, data }
    } catch (e: any) {
      // Consider network abort/timeouts as background-queued success
      if (e?.name === 'AbortError') {
        return { success: true, data: { queued: true } }
      }
      return { success: false, error: e.message || 'ingest failed' }
    }
  },

  // AI Teacher API methods - Direct to Python service (port 8003)
  async startTeacherSession(request: StartSessionRequest): Promise<ApiResponse<{ sessionId: string }>> {
    try {
      const response = await fetch(`${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8003'}/teacher/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        throw new Error(`Start session failed: ${response.status}`)
      }

      const data = await response.json()
      return {
        success: true,
        data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      }
    }
  },

  // AI Teacher Streaming (NDJSON via fetch for readable stream) - Direct to Python service
  async streamTeacherLesson(params: {
    request: StreamLessonRequest;
    onEvent: (evt: TeacherEvent) => void;
    onError?: (error: Error) => void;
    onDone?: () => void;
  }): Promise<void> {
    const { request, onEvent, onError, onDone } = params
    try {
      const url = `${process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8003'}/teacher/stream`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/plain; charset=utf-8',
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      })
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Teacher stream failed (${resp.status}): ${text}`)
      }

      const reader = (resp.body as any).getReader?.()
      if (!reader) {
        const text = await resp.text()
        try {
          const obj = JSON.parse(text)
          onEvent(obj)
        } catch {
          onEvent({ type: 'error', message: text })
        }
        onEvent({ type: 'done' })
        onDone?.()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // split by newlines for NDJSON
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const evt = JSON.parse(trimmed) as TeacherEvent
            onEvent(evt)
          } catch (e) {
            // Fallback: treat as error
            onEvent({ type: 'error', message: trimmed })
          }
        }
      }
      if (buffer.trim()) {
        try {
          onEvent(JSON.parse(buffer.trim()))
        } catch {
          onEvent({ type: 'error', message: buffer.trim() })
        }
      }
      onEvent({ type: 'done' })
      onDone?.()
    } catch (err: any) {
      onError?.(err)
      throw err
    }
  },

  // Report render errors for auto-fix
  async reportTeacherRenderError(report: RenderErrorReport): Promise<ApiResponse<any>> {
    try {
      const response = await api.post('/agents/teacher/render-error', report)
      return {
        success: true,
        data: response.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      }
    }
  },

  // User customization (Customize Lucid)
  async getUserCustomization(): Promise<ApiResponse<{
    displayName?: string;
    occupation?: string;
    traits?: string;
    extraNotes?: string;
    preferredLanguage?: string;
  }>> {
    try {
      const response = await api.get('/users/customize')
      return { success: true, data: response.data }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message }
    }
  },

  async updateUserCustomization(updates: {
    displayName?: string;
    occupation?: string;
    traits?: string;
    extraNotes?: string;
    preferredLanguage?: string;
  }): Promise<ApiResponse<{
    displayName?: string;
    occupation?: string;
    traits?: string;
    extraNotes?: string;
    preferredLanguage?: string;
  }>> {
    try {
      const response = await api.put('/users/customize', updates)
      return { success: true, data: response.data }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message }
    }
  },
}

export default api
