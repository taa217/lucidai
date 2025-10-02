import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { CodeSlideRuntime } from './CodeSlideRuntime'
import { TeacherEvent, TeacherSession } from '../../types'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useTeacherStream } from './hooks/useTeacherStream'

// Removed the old ErrorBoundary class as CodeSlideRuntime now includes its own
// The onError prop in AITeacherSession will still receive errors from CodeSlideRuntime

interface AITeacherSessionProps {
  topic: string
  userId?: string
  onComplete?: () => void
  onError?: (error: Error) => void
}

export const AITeacherSession: React.FC<AITeacherSessionProps> = ({
  topic,
  userId,
  onComplete,
  onError
}) => {
  const [session, setSession] = useState<TeacherSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Audio + time tracking
  const { isPlaying, timeSeconds, showReplay, requestPlay, togglePlayPause, replay, cleanup } = useAudioPlayer()
  // Stream control
  const { isLoading, startStreaming, abort } = useTeacherStream({
    topic,
    userId,
    onEvent: (event: TeacherEvent) => handleTeacherEvent(event),
    onError: (err: Error) => {
      console.error('AITeacherSession: Stream error:', err)
      setError(err.message)
      onError?.(err)
    },
    onDone: () => {
      try { console.log('AITeacherSession:onDone') } catch {}
      setSession(prev => prev ? { ...prev, status: 'completed' } : null)
    },
  })
  // No more isRepairing state here, CodeSlideRuntime manages internal error display/reporting
  const currentAudioUrlRef = useRef<string | null>(null)
  const didStartRef = useRef<boolean>(false)
  const prevTopicRef = useRef<string | undefined>(undefined)

  // Start streaming lesson directly (wrap to clear error and reset local state)
  const startStreamingWrapped = useCallback(() => {
    setError(null)
    currentAudioUrlRef.current = null
    startStreaming()
  }, [startStreaming])

  // Handle teacher events
  const handleTeacherEvent = useCallback((event: TeacherEvent) => {
    setSession(prev => {
      // Create session if it doesn't exist (or update if new topic/session_id)
      let currentSession = prev || {
        sessionId: event.session_id || `teacher_${userId || 'anon'}_${Date.now()}`,
        topic,
        userId,
        status: 'active',
        isPlaying: false,
        timeSeconds: 0,
        renderCode: '',
        timeline: [],
        audioUrl: '',
        currentEvent: event,
      }

      // Always update sessionId if a new one comes from the backend
      if (event.session_id) currentSession.sessionId = event.session_id;

      const updated = { ...currentSession }

      switch (event.type) {
        case 'start':
          updated.status = 'active'
          break

        case 'render':
          if (event.render) {
            updated.renderCode = event.render.code || updated.renderCode // Keep old code if new is empty
            updated.timeline = event.render.timeline || updated.timeline
          }
          break

        case 'speak':
          if (event.speak) {
            const resolveAudioUrl = (url?: string) => {
              if (!url) return undefined
              if (/^https?:/i.test(url)) return url
              try {
                const { protocol, hostname } = window.location
                const base = `${protocol}//${hostname}:8003`
                return `${base}${url}`
              } catch {
                return url
              }
            }

            const resolvedUrl = resolveAudioUrl(event.speak.audio_url)
            updated.audioUrl = resolvedUrl
            if (resolvedUrl && resolvedUrl !== currentAudioUrlRef.current) {
              currentAudioUrlRef.current = resolvedUrl
              requestPlay(resolvedUrl)
            }
          }
          break

        case 'error':
          updated.status = 'error'
          setError(event.message || 'Unknown error occurred')
          break

        case 'final':
          updated.status = 'completed'
          // Don't show replay here - let audio 'ended' event handle it
          break
      }

      updated.currentEvent = event
      return updated
    })
  }, [topic, userId])

  const replayLesson = useCallback(() => { replay() }, [replay])

  // Handle render errors from CodeSlideRuntime
  const handleRenderError = useCallback((error: Error) => {
    console.error('AITeacherSession: Render error received from CodeSlideRuntime:', error)
    // CodeSlideRuntime now handles its own error display and reporting
    // We just need to log it and potentially restart if needed
    if (session && !session.renderCode) {
      console.log('AITeacherSession: Attempting to restart lesson after render error')
      startStreaming()
    }
  }, [session, startStreaming])

  // Start streaming on mount (guard StrictMode double invoke)
  useEffect(() => {
    try { console.log('AITeacherSession:mount') } catch {}
    if (!didStartRef.current) {
      didStartRef.current = true
      startStreamingWrapped()
    }
  }, [startStreamingWrapped])

  // Reset session state only when topic actually changes (skip initial mount)
  useEffect(() => {
    const prev = prevTopicRef.current
    prevTopicRef.current = topic
    if (prev !== undefined && prev !== topic) {
      try { console.log('AITeacherSession:topicChanged', { from: prev, to: topic }) } catch {}
      setSession(null)
      setError(null)
      abort()
      Promise.resolve().then(() => startStreamingWrapped())
    }
  }, [topic, startStreamingWrapped, abort])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { console.log('AITeacherSession:unmount') } catch {}
      cleanup()
      abort()
      didStartRef.current = false
    }
  }, [cleanup, abort])

  if (isLoading && !session) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Starting lesson...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <VolumeX className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Lesson Error</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={startStreaming}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="relative w-full h-full min-h-[500px] bg-gray-50 rounded-lg overflow-hidden">
      {/* Main content area */}
      <div className="absolute inset-0">
        {session.renderCode ? (
          <CodeSlideRuntime
            code={session.renderCode}
            sessionId={session.sessionId}
            userId={session.userId}
            topic={session.topic}
            timeline={session.timeline}
            isPlaying={isPlaying}
            timeSeconds={timeSeconds}
            onError={handleRenderError}
            onRenderComplete={() => {
              console.log('AITeacherSession: Render completed')
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Preparing visuals...</p>
            </div>
          </div>
        )}
      </div>

      {/* Audio controls overlay */}
      <div className="absolute bottom-4 right-4 flex items-center space-x-2">
        {session.audioUrl && (
          <button
            onClick={togglePlayPause}
            className="p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 text-gray-700" />
            ) : (
              <Play className="h-5 w-5 text-gray-700" />
            )}
          </button>
        )}
      </div>

      {/* Removed repairing overlay - CodeSlideRuntime handles its own error display */}

      {/* Replay overlay */}
      <AnimatePresence>
        {showReplay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
          >
            <div className="bg-white rounded-lg p-6 text-center">
              <RotateCcw className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Lesson Complete</h3>
              <p className="text-gray-600 mb-4">Ready to replay this lesson?</p>
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={replayLesson}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Replay Lesson
                </button>
                <button
                  onClick={onComplete}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AITeacherSession
