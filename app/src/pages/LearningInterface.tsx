import React, { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Play, BookOpen, Brain, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { documentService } from '../services/documentService'
import { AITeacherSession } from '../components/ai-teacher/AITeacherSession'

export const LearningInterface: React.FC = () => {
  const [inputValue, setInputValue] = useState('')
  const [selectedMode, setSelectedMode] = useState<'interactive' | 'read' | 'research'>('interactive')
  const [isTeaching, setIsTeaching] = useState(false)
  const [currentTopic, setCurrentTopic] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Research UI state
  const [isResearching, setIsResearching] = useState(false)
  const [activeResearchTab, setActiveResearchTab] = useState<'answer' | 'sources'>('answer')
  const [researchAnswer, setResearchAnswer] = useState('')
  const [researchSources, setResearchSources] = useState<Array<{ title?: string; url: string }>>([])
  const [researchError, setResearchError] = useState<string | null>(null)
  const [researchSessionId, setResearchSessionId] = useState<string | null>(null)
  const [researchHistory, setResearchHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [researchQuery, setResearchQuery] = useState<string>('')
  const [threads, setThreads] = useState<Array<{ id: string; query: string; answer: string; sources: Array<{title?: string; url: string}> }>>([])

  const apiBase = useMemo(() => {
    // Prefer explicit backend host if provided, else same-origin.
    const fromEnv = (typeof process !== 'undefined' && (process as any)?.env?.EXPO_PUBLIC_API_HOST) || ''
    if (fromEnv) return String(fromEnv).replace(/\/$/, '')
    // Heuristic for local dev: if app runs on 3000, default backend to 3001
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location
      const guessedPort = port === '3000' ? '3001' : port
      const base = `${protocol}//${hostname}${guessedPort ? `:${guessedPort}` : ''}`
      return base.replace(/\/$/, '')
    }
    return ''
  }, [])
  const baseHeaders = useMemo(() => ({ 'Content-Type': 'application/json' }), [])

  // Anonymous user id for research sessions (UUID persisted locally)
  const researchUserId = useMemo(() => {
    const ensureUuid = () => {
      if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
        return (crypto as any).randomUUID()
      }
      // RFC4122-like fallback
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    }
    try {
      if (typeof window !== 'undefined') {
        const key = 'lucid_research_user_id'
        const existing = window.localStorage.getItem(key)
        if (existing) return existing
        const id = ensureUuid()
        window.localStorage.setItem(key, id)
        return id
      }
    } catch {}
    return '00000000-0000-4000-8000-000000000000'
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      if (selectedMode === 'interactive') {
        // Start AI Teacher session
        setCurrentTopic(inputValue.trim())
        setIsTeaching(true)
        setInputValue('')
      } else if (selectedMode === 'research') {
        startResearch(inputValue.trim())
        setInputValue('')
      } else {
        // Handle other modes (read/research)
        console.log('Learning request:', inputValue, 'Mode:', selectedMode)
        setInputValue('')
      }
    }
  }

  const handleModeChange = (mode: 'interactive' | 'read' | 'research') => {
    setSelectedMode(mode)
  }

  const handleTeachingComplete = () => {
    setIsTeaching(false)
    setCurrentTopic('')
  }

  const handleTeachingError = (error: Error) => {
    console.error('Teaching error:', error)
    setIsTeaching(false)
    setCurrentTopic('')
  }

  const triggerPdfPicker = () => {
    if (isUploading) return
    fileInputRef.current?.click()
  }

  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const resp = await documentService.uploadDocument(file, [], false)
      const uploadedId = resp?.data?.document?.id || resp?.data?.id || resp?.data?.documentId
      if (resp.success && uploadedId) {
        navigate(`/read/${uploadedId}`)
      } else {
        navigate('/library')
      }
    } catch (err) {
      console.error('PDF upload failed:', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // --- Research streaming (Perplexity proxy on backend; model set to GPT-5 for context) ---
  async function startResearch(question: string) {
    if (!question) return
    setResearchError(null)
    setIsResearching(true)
    setActiveResearchTab('answer')
    setResearchAnswer('')
    setResearchSources([])
    setResearchQuery(question)
    const threadId = `${Date.now()}`
    setThreads(prev => [{ id: threadId, query: question, answer: '', sources: [] }, ...prev])
    const sessionId = researchSessionId || `research_${Date.now()}`
    if (!researchSessionId) setResearchSessionId(sessionId)
    setResearchHistory((prev) => [...prev, { role: 'user', content: question }])

    try {
      const resp = await fetch(`${apiBase}/api/agents/research/stream`, {
        method: 'POST',
        headers: { ...baseHeaders, 'Accept': 'text/plain' },
        body: JSON.stringify({
          // Backend expects: sessionId, userId, query, conversationHistory
          sessionId,
          userId: researchUserId,
          query: question,
          // omit conversationHistory to let backend persist from DB and avoid provider 400s
        }),
      })

      if (!resp.ok || !resp.body) {
        throw new Error(`Request failed (${resp.status})`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffered = ''

      // stream loop
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffered += decoder.decode(value, { stream: true })
        const lines = buffered.split(/\n+/)
        buffered = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const evt = JSON.parse(trimmed)
            switch (evt.type) {
              case 'content': {
                if (typeof evt.delta === 'string') {
                  setResearchAnswer((prev) => prev + evt.delta)
                  setThreads(prev => prev.map(t => t.id === threadId ? { ...t, answer: (t.answer || '') + evt.delta } : t))
                }
                break
              }
              case 'citations': {
                const list = Array.isArray(evt.results) ? evt.results : []
                if (list.length) {
                  setResearchSources(
                    list
                      .filter((s: any) => s && (s.url || s.link || s.source_url))
                      .map((s: any) => ({ title: s.title || s.name || s.source, url: s.url || s.link || s.source_url }))
                  )
                  setThreads(prev => prev.map(t => t.id === threadId ? { ...t, sources: list
                    .filter((s: any) => s && (s.url || s.link || s.source_url))
                    .map((s: any) => ({ title: s.title || s.name || s.source, url: s.url || s.link || s.source_url })) } : t))
                }
                break
              }
              case 'final': {
                const text = typeof evt.content === 'string' ? evt.content : (evt.text || '')
                if (text) setResearchAnswer(text)
                if (text) setThreads(prev => prev.map(t => t.id === threadId ? { ...t, answer: text } : t))
                setResearchHistory((prev) => [
                  ...prev,
                  { role: 'assistant', content: text || researchAnswer },
                ])
                break
              }
              case 'session': {
                if (evt.sessionId && !researchSessionId) setResearchSessionId(evt.sessionId)
                break
              }
              case 'error': {
                setResearchError(evt.message || 'Research failed')
                break
              }
            }
          } catch (err) {
            // ignore malformed lines
          }
        }
      }
    } catch (err: any) {
      setResearchError(err?.message || 'Network error')
    } finally {
      setIsResearching(false)
    }
  }

  // Show AI Teacher session when teaching
  if (isTeaching && currentTopic) {
    return (
      <div className="flex-1 flex flex-col p-4">
        <div className="mb-4">
          <button
            onClick={handleTeachingComplete}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            ← Back to learning
          </button>
        </div>
        <div className="flex-1">
          <AITeacherSession
            topic={currentTopic}
            userId="current-user" // TODO: Get from auth context
            onComplete={handleTeachingComplete}
            onError={handleTeachingError}
          />
        </div>
      </div>
    )
  }

  // Lightweight markdown renderer for Answer tab
  const renderMarkdown = (text: string) => {
    // Very small subset: headings, bold, italics, code, links, lists
    const html = text
      .replace(/^###\s(.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1<\/h3>')
      .replace(/^##\s(.+)$/gm, '<h2 class="text-xl font-bold mt-5 mb-3">$1<\/h2>')
      .replace(/^#\s(.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1<\/h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1<\/strong>')
      .replace(/\*(.+?)\*/g, '<em>$1<\/em>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-100 rounded">$1<\/code>')
      .replace(/\n-\s(.+)/g, '<br/><span class="inline-block pl-4">• $1<\/span>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\[(.*?)\]\((https?:[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary-600 hover:underline">$1<\/a>')
    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
  }

  // Render Research session UI when active
  if (selectedMode === 'research' && (isResearching || researchAnswer || researchHistory.length > 0)) {
    return (
      <div className="flex-1 flex flex-col p-4">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => {
              setIsResearching(false)
              setResearchAnswer('')
              setResearchSources([])
              setResearchError(null)
              setResearchHistory([])
              setResearchSessionId(null)
              setInputValue('')
              setResearchQuery('')
            }}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            ← Back to learning
          </button>

          <div />
        </div>

        <div className="flex-1 overflow-auto bg-transparent p-0">
          {/* Sticky query header like Perplexity */}
          <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-100 px-6 pt-4 pb-3">
            <h2 className="text-[22px] font-semibold text-gray-900 mb-2">{researchQuery || 'Research'}</h2>
            <div className="flex items-center space-x-2 bg-gray-100 rounded-full p-1 w-fit">
              <button
                onClick={() => setActiveResearchTab('answer')}
                className={`px-4 py-1.5 rounded-full text-sm ${
                  activeResearchTab === 'answer' ? 'bg-white shadow text-gray-900' : 'text-gray-700'
                }`}
              >
                Answer
              </button>
              <button
                onClick={() => setActiveResearchTab('sources')}
                className={`px-4 py-1.5 rounded-full text-sm ${
                  activeResearchTab === 'sources' ? 'bg-white shadow text-gray-900' : 'text-gray-700'
                }`}
              >
                Sources {researchSources.length ? `(${researchSources.length})` : ''}
              </button>
            </div>
          </div>
          <div className="px-6 py-6 space-y-10">
            {/* Thread list (newest first) */}
            {threads.map((t, idx) => (
              <div key={t.id} className="max-w-3xl pr-2">
                <div className="text-sm font-medium text-gray-500 mb-2">{t.query}</div>
                {activeResearchTab === 'answer' ? (
                  <div className="text-[15px] leading-7 text-gray-900">
                    {t.answer ? renderMarkdown(t.answer) : (idx === 0 && isResearching ? <p className="text-gray-500">Thinking…</p> : null)}
                  </div>
                ) : (
                  <div className="max-w-4xl">
                    {t.sources?.length ? (
                      <div className="space-y-3">
                        {t.sources.map((s, sidx) => {
                          let domain = ''
                          try { const u = new URL(s.url); domain = u.hostname.replace(/^www\./,'') } catch {}
                          const favicon = domain ? `https://www.google.com/s2/favicons?sz=32&domain=${domain}` : ''
                          return (
                            <a
                              key={sidx}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                              {favicon ? <img src={favicon} alt="" className="mt-0.5 h-4 w-4" /> : <div className="mt-1 h-4 w-4 rounded bg-gray-200" />}
                              <div>
                                <div className="text-sm font-medium text-gray-900">{s.title || s.url}</div>
                                {domain ? <div className="text-xs text-gray-500">{domain}</div> : null}
                              </div>
                            </a>
                          )
                        })}
                      </div>
                    ) : (
                      idx === 0 && isResearching ? <p className="text-gray-500">Gathering sources…</p> : <p className="text-gray-500">No sources.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Fixed bottom follow-up input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (inputValue.trim()) {
              startResearch(inputValue.trim())
              setInputValue('')
            }
          }}
          className="mt-4 sticky bottom-3 self-center w-full"
        >
          <div className="relative w-full max-w-3xl mx-auto">
            <div className="bg-white border border-gray-300 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 w-full">
              <div className="flex items-center px-6 py-4">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isResearching ? 'Waiting for answer…' : 'Ask a follow-up question'}
                  className="flex-1 outline-none text-gray-900 placeholder-gray-500 text-lg min-w-0"
                  disabled={isResearching}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isResearching}
                  className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ml-4"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-32 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center w-full max-w-4xl mx-auto flex flex-col items-center"
      >
        {/* Main prompt text */}
        <h1 className="text-4xl font-bold text-gray-900 mb-12 text-center">
          What do you want to learn?
        </h1>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="w-full max-w-3xl flex justify-center">
          <div className="relative w-full">
            {/* Input field with integrated mode selection */}
            <div className="bg-white border border-gray-300 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 w-full">
              {/* Input row */}
              <div className="flex items-center px-6 py-4">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask anything. Type @ for mentions and / for shortcuts."
                  className="flex-1 outline-none text-gray-900 placeholder-gray-500 text-lg min-w-0"
                />
                {selectedMode === 'read' && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={handlePdfSelected}
                    />
                    <button
                      type="button"
                      onClick={triggerPdfPicker}
                      disabled={isUploading}
                      className="p-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ml-4"
                      title={isUploading ? 'Uploading...' : 'Upload PDF'}
                    >
                      <Upload className="h-5 w-5" />
                    </button>
                  </>
                )}
                <button
                  type="submit"
                  disabled={selectedMode === 'read' || !inputValue.trim()}
                  className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ml-4"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
              
              {/* Mode selection icons at bottom, aligned to left - reduced height */}
              <div className="flex items-center px-6 pb-1">
                <div className="flex items-center space-x-1 bg-gray-50 rounded-lg px-2 py-1">
                  {/* Interactive Mode */}
                  <button
                    onClick={() => handleModeChange('interactive')}
                    title="Interactive"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      selectedMode === 'interactive'
                        ? 'bg-primary-100 border border-primary-300 text-primary-700'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  
                  {/* Read Mode */}
                  <button
                    onClick={() => handleModeChange('read')}
                    title="Read"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      selectedMode === 'read'
                        ? 'bg-primary-100 border border-primary-300 text-primary-700'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <BookOpen className="h-4 w-4" />
                  </button>
                  
                  {/* Research Mode */}
                  <button
                    onClick={() => handleModeChange('research')}
                    title="Research"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      selectedMode === 'research'
                        ? 'bg-primary-100 border border-primary-300 text-primary-700'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <Brain className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Optional subtitle */}
        <p className="mt-8 text-gray-600 text-lg text-center">
          Start your learning journey with AI-powered assistance
        </p>
      </motion.div>
    </div>
  )
}
