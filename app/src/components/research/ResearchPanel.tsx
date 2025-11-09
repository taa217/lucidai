import React, { useEffect, useState } from 'react'

interface Source { title?: string; url: string }

interface ResearchThread { id: string; query: string; answer: string; sources: Source[] }

interface ResearchPanelProps {
  apiBase: string
  baseHeaders: Record<string, string>
  userId: string
  initialQuestion?: string
}

export const ResearchPanel: React.FC<ResearchPanelProps> = ({ apiBase, baseHeaders, userId, initialQuestion }) => {
  const [isResearching, setIsResearching] = useState(false)
  const [activeResearchTab, setActiveResearchTab] = useState<'answer' | 'sources'>('answer')
  const [researchAnswer, setResearchAnswer] = useState('')
  const [researchSources, setResearchSources] = useState<Source[]>([])
  const [, setResearchError] = useState<string | null>(null)
  const [researchSessionId, setResearchSessionId] = useState<string | null>(null)
  const [, setResearchHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [researchQuery, setResearchQuery] = useState<string>(initialQuestion || '')
  const [threads, setThreads] = useState<ResearchThread[]>([])
  const [inputValue, setInputValue] = useState('')

  const renderMarkdown = (text: string) => {
    const html = text
      .replace(/^###\s(.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^##\s(.+)$/gm, '<h2 class="text-xl font-bold mt-5 mb-3">$1</h2>')
      .replace(/^#\s(.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-100 rounded">$1</code>')
      .replace(/\n-\s(.+)/g, '<br/><span class="inline-block pl-4">• $1</span>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\[(.*?)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-accent-600 hover:text-accent-700 hover:underline">$1</a>')
    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
  }

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
        body: JSON.stringify({ sessionId, userId, query: question }),
      })
      if (!resp.ok || !resp.body) throw new Error(`Request failed (${resp.status})`)
      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffered = ''
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
                  const mapped = list
                    .filter((s: any) => s && (s.url || s.link || s.source_url))
                    .map((s: any) => ({ title: s.title || s.name || s.source, url: s.url || s.link || s.source_url }))
                  setResearchSources(mapped)
                  setThreads(prev => prev.map(t => t.id === threadId ? { ...t, sources: mapped } : t))
                }
                break
              }
              case 'final': {
                const text = typeof evt.content === 'string' ? evt.content : (evt.text || '')
                if (text) setResearchAnswer(text)
                if (text) setThreads(prev => prev.map(t => t.id === threadId ? { ...t, answer: text } : t))
                setResearchHistory((prev) => [...prev, { role: 'assistant', content: text || researchAnswer }])
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
          } catch {}
        }
      }
    } catch (err: any) {
      setResearchError(err?.message || 'Network error')
    } finally {
      setIsResearching(false)
    }
  }

  useEffect(() => {
    if (initialQuestion && !threads.length && !isResearching) {
      startResearch(initialQuestion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])

  return (
    <div className="flex-1 flex flex-col p-4">
      <div className="flex-1 overflow-auto bg-transparent p-0">
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-700 px-6 pt-4 pb-3">
          <h2 className="text-[22px] font-semibold text-gray-900 dark:text-gray-100 mb-2">{researchQuery || 'Research'}</h2>
          <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 rounded-full p-1 w-fit">
            <button onClick={() => setActiveResearchTab('answer')} className={`px-4 py-1.5 rounded-full text-sm ${activeResearchTab === 'answer' ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>Answer</button>
            <button onClick={() => setActiveResearchTab('sources')} className={`px-4 py-1.5 rounded-full text-sm ${activeResearchTab === 'sources' ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>Sources {researchSources.length ? `(${researchSources.length})` : ''}</button>
          </div>
        </div>
        <div className="px-6 py-6 space-y-10">
          {threads.map((t, idx) => (
            <div key={t.id} className="max-w-3xl pr-2">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{t.query}</div>
              {activeResearchTab === 'answer' ? (
                <div className="text-[15px] leading-7 text-gray-900 dark:text-gray-100">
                  {t.answer ? renderMarkdown(t.answer) : (idx === 0 && isResearching ? <p className="text-gray-500 dark:text-gray-400">Thinking…</p> : null)}
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
                          <a key={sidx} href={s.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            {favicon ? <img src={favicon} alt="" className="mt-0.5 h-4 w-4" /> : <div className="mt-1 h-4 w-4 rounded bg-gray-200" />}
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.title || s.url}</div>
                              {domain ? <div className="text-xs text-gray-500 dark:text-gray-400">{domain}</div> : null}
                            </div>
                          </a>
                        )
                      })}
                    </div>
                  ) : (
                    idx === 0 && isResearching ? <p className="text-gray-500 dark:text-gray-400">Gathering sources…</p> : <p className="text-gray-500 dark:text-gray-400">No sources.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (inputValue.trim()) { startResearch(inputValue.trim()); setInputValue('') } }} className="mt-4 sticky bottom-3 self-center w-full">
        <div className="relative w-full max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 w-full">
            <div className="flex items-center px-6 py-4">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={isResearching ? 'Waiting for answer…' : 'Ask a follow-up question'} className="flex-1 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-lg min-w-0 bg-transparent" disabled={isResearching} />
              <button type="submit" disabled={!inputValue.trim() || isResearching} className="p-2 bg-accent-500 text-primary-500 rounded-lg hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ml-4 font-semibold">
                Send
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

export default ResearchPanel


