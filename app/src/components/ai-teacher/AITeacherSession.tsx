import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { apiService } from '../../services/api'
import { CodeSlideRuntime } from './CodeSlideRuntime'
import { TeacherEvent, TeacherSession, StreamLessonRequest } from '../../types'

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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [timeSeconds, setTimeSeconds] = useState(0)
  const [showReplay, setShowReplay] = useState(false)
  // No more isRepairing state here, CodeSlideRuntime manages internal error display/reporting
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timeIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const streamAbortRef = useRef<AbortController | undefined>(undefined)

  // Start streaming lesson directly
  const startStreaming = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setTimeSeconds(0) // Reset time when starting a new stream
    setShowReplay(false) // Hide replay UI

    try {
      const request: StreamLessonRequest = {
        topic,
        user_id: userId,
        session_id: `teacher_${userId || 'anon'}_${Date.now()}`,
        tts: true,
        language: 'en'
      }

      // Abort any existing stream before starting a new one
      if (streamAbortRef.current) {
        streamAbortRef.current.abort()
      }
      streamAbortRef.current = new AbortController()

      await apiService.streamTeacherLesson({
        request,
        onEvent: (event: TeacherEvent) => {
          handleTeacherEvent(event)
        },
        onError: (err: Error) => {
          console.error("AITeacherSession: Stream error:", err)
          setError(err.message)
          onError?.(err)
        },
        onDone: () => {
          setIsLoading(false)
          setSession(prev => prev ? { ...prev, status: 'completed' } : null)
          // Only show replay if no critical error occurred
          if (!error) { 
            setShowReplay(true)
            stopTimeTracking() // Ensure time tracking stops
          }
        }
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("AITeacherSession: Stream aborted successfully.")
      } else {
        console.error("AITeacherSession: Failed to start streaming lesson:", err)
        setError(err.message)
        onError?.(err)
      }
      setIsLoading(false)
    }
  }, [topic, userId, onError, error]) // Add error to dependencies to avoid showing replay on error

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
            if (event.speak.audio_url) {
              // Start audio playback
              setTimeout(() => {
                if (resolvedUrl) {
                  playAudio(resolvedUrl)
                }
              }, 100)
            }
          }
          break

        case 'error':
          updated.status = 'error'
          setError(event.message || 'Unknown error occurred')
          break

        case 'final':
          updated.status = 'completed'
          setShowReplay(true)
          break
      }

      updated.currentEvent = event
      return updated
    })
  }, [topic, userId])

  // Audio playback controls
  const playAudio = useCallback((audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    const audio = new Audio(audioUrl)
    try {
      ;(audio as any).playsInline = true
    } catch {}
    audio.preload = 'auto'
    audio.autoplay = true
    audioRef.current = audio

    audio.addEventListener('loadstart', () => {
      setIsPlaying(true)
    })

    audio.addEventListener('play', () => {
      setIsPlaying(true)
      startTimeTracking()
    })

    audio.addEventListener('pause', () => {
      setIsPlaying(false)
      stopTimeTracking()
    })

    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      setShowReplay(true)
      stopTimeTracking()
    })

    audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e)
      setIsPlaying(false)
      stopTimeTracking()
      
      // Try to recover from audio errors
      setTimeout(() => {
        if (session?.audioUrl) {
          console.log('Retrying audio playback after error')
          playAudio(session.audioUrl)
        }
      }, 2000)
    })

    audio.play().catch(err => {
      console.error('Failed to play audio:', err)
      setIsPlaying(false)
    })
  }, [])

  const startTimeTracking = useCallback(() => {
    stopTimeTracking()
    timeIntervalRef.current = setInterval(() => {
      if (audioRef.current) {
        const newTime = audioRef.current.currentTime
        // Only update if time has changed significantly to prevent excessive re-renders
        setTimeSeconds(prevTime => {
          const diff = Math.abs(newTime - prevTime)
          return diff > 0.1 ? newTime : prevTime
        })
      }
    }, 200) // Reduced frequency to 200ms instead of 100ms
  }, [])

  const stopTimeTracking = useCallback(() => {
    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current)
      timeIntervalRef.current = undefined
    }
  }, [])

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(err => {
        console.error('Failed to resume audio:', err)
      })
    }
  }, [isPlaying])

  const replayLesson = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(err => {
        console.error('Failed to replay audio:', err)
      })
    }
    setShowReplay(false)
    setTimeSeconds(0)
  }, [])

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

  // Start streaming on mount
  useEffect(() => {
    startStreaming()
  }, [startStreaming])

  // Reset session state when topic changes
  useEffect(() => {
    setSession(null)
    setError(null)
    setIsPlaying(false)
    setTimeSeconds(0)
    setShowReplay(false)
  }, [topic])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      stopTimeTracking()
      if (streamAbortRef.current) {
        streamAbortRef.current.abort()
      }
    }
  }, [stopTimeTracking])

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
      <div className="relative w-full h-full">
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
