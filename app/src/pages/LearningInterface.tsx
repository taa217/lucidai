import React, { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Play, BookOpen, Brain, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { documentService } from '../services/documentService'
import { AITeacherSession } from '../components/ai-teacher/AITeacherSession'
import { ResearchPanel } from '../components/research/ResearchPanel'

export const LearningInterface: React.FC = () => {
  const [inputValue, setInputValue] = useState('')
  const [selectedMode, setSelectedMode] = useState<'interactive' | 'read' | 'research'>('interactive')
  const [isTeaching, setIsTeaching] = useState(false)
  const [currentTopic, setCurrentTopic] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Minimal research entry state
  const [researchInitialQuestion, setResearchInitialQuestion] = useState<string>('')

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
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : ((r & 0x3) | 0x8)
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
        setResearchInitialQuestion(inputValue.trim())
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

  // Research handled by ResearchPanel component

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

  // Render Research session UI when active
  if (selectedMode === 'research') {
    return (
      <ResearchPanel apiBase={apiBase} baseHeaders={baseHeaders} userId={researchUserId} initialQuestion={researchInitialQuestion} />
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
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-12 text-center">
          What do you want to learn?
        </h1>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="w-full max-w-3xl flex justify-center">
          <div className="relative w-full">
            {/* Input field with integrated mode selection */}
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 w-full">
              {/* Input row */}
              <div className="flex items-center px-6 py-4">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask anything. Type @ for mentions and / for shortcuts."
                  className="flex-1 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-lg min-w-0 bg-transparent"
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
                <div className="flex items-center space-x-1 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1">
                  {/* Interactive Mode */}
                  <button
                    onClick={() => handleModeChange('interactive')}
                    title="Interactive"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      selectedMode === 'interactive'
                        ? 'bg-primary-100 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
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
                        ? 'bg-primary-100 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    <BookOpen className="h-4 w-4" />
                  </button>
                  
                  {/* Research Mode */}
                  <button
                    onClick={() => handleModeChange('research')}
                    title="Research"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      false
                        ? 'bg-primary-100 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
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
        <p className="mt-8 text-gray-600 dark:text-gray-400 text-lg text-center">
          Start your learning journey with AI-powered assistance
        </p>
      </motion.div>
    </div>
  )
}
