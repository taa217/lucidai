import React, { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import { apiService } from '../services/api'
import { ChatMessage } from '../types'

interface ChatInterfaceProps {
  sessionId: string
  userId: string
  docId?: string
  documentTitle?: string
  documentUrl?: string
  initialMessages?: ChatMessage[]
  onMessageSent?: (message: ChatMessage) => void
  className?: string
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  sessionId,
  userId,
  docId,
  documentTitle,
  documentUrl,
  initialMessages = [],
  onMessageSent,
  className = ''
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load chat history on mount
  useEffect(() => {
    // Only load history when we have a real UUID session id
    const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    if (sessionId && isUuid(sessionId) && initialMessages.length === 0) {
      loadChatHistory()
    }
  }, [sessionId])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadChatHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const response = await apiService.getChatMessages(sessionId, 100)
      if (response.success && response.data) {
        setMessages(response.data)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId,
      userId,
      role: 'user',
      content: inputValue.trim(),
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Add user message immediately
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      // Prepare context for the AI
      const context = {
        docId,
        documentTitle,
        documentUrl,
        source: 'read_document',
        sessionId,
        userId,
        collection: docId && userId ? `${userId}_doc_${docId}` : undefined,
        // Include OpenAI file attachment if ingestion provided a file_id
        ...(docId && userId ? (() => {
          try {
            const fid = localStorage.getItem(`lucid_ingest_openai_file_id_${userId}_${docId}`)
            return fid ? { openai_file_id: fid, attachments: [fid] } : {}
          } catch {
            return {}
          }
        })() : {}),
        // Force Responses API path so attachments are honored
        model: { key: 'gpt-5-2025-08-07' },
      }

      // Ingestion is handled in DocumentReader to avoid duplicate requests here

      // Create a placeholder assistant message for streaming
      const assistantId = `assistant-${Date.now()}`
      const baseAssistant: ChatMessage = {
        id: assistantId,
        sessionId,
        userId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      setMessages(prev => [...prev, baseAssistant])

      // Stream from backend
      const sessionAlias = sessionId || (docId ? `read_${docId}` : `session_${Date.now()}`)
      await apiService.streamQuestion({
        question: userMessage.content,
        context,
        sessionId: sessionAlias,
        userId,
        preferredProvider: 'openai',
        onEvent: (evt) => {
          if (evt.type === 'content' && (evt.delta || evt.content)) {
            const delta: string = evt.delta || evt.content || ''
            if (!delta) return
            setMessages(prev => prev.map(m => m.id === assistantId ? {
              ...m,
              content: (m.content || '') + delta,
              updatedAt: new Date()
            } : m))
          } else if (evt.type === 'final') {
            if (evt.content || evt.answer || evt.response) {
              setMessages(prev => prev.map(m => m.id === assistantId ? {
                ...m,
                content: evt.content || evt.answer || evt.response,
                updatedAt: new Date()
              } : m))
            }
          }
        },
        onError: () => {
          // Update the placeholder assistant message instead of adding a second error bubble
          setMessages(prev => prev.map(m => m.id === assistantId ? {
            ...m,
            content: 'Sorry, I encountered an error while processing your question. Please try again.',
            updatedAt: new Date()
          } : m))
        },
        onDone: () => {
          // Look up latest assistant message by id at time of completion
          setMessages(prev => {
            const latest = prev.find(m => m.id === assistantId)
            if (latest) onMessageSent?.(latest)
            return prev
          })
          setIsLoading(false)
        }
      })
    } catch (error) {
      console.error('Failed to send message:', error)
      // Avoid adding a second error message; the streaming onError already updated the placeholder
      setIsLoading(false)
    }
  }

  const formatMessage = (content: string) => {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>')
      .replace(/\n/g, '<br>')
  }

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {isLoadingHistory && (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading chat history...</span>
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-gray-400 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">Start a Conversation</h4>
            <p className="text-gray-500 max-w-sm">
              Ask a question about your document or any topic. I'm here to help!
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`flex max-w-[90%] ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white ml-2'
                    : 'bg-gray-200 text-gray-600 mr-2'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="h-3 w-3" />
                ) : (
                  <Bot className="h-3 w-3" />
                )}
              </div>

              {/* Message Content */}
              <div className="flex-1">
                <div
                  className={`text-sm leading-relaxed ${
                    message.role === 'user' ? 'text-gray-900' : 'text-gray-700'
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: formatMessage(message.content)
                  }}
                />
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex max-w-[90%]">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 mr-2 flex items-center justify-center">
                <Bot className="h-3 w-3" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2 text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question about the document..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
