import { useCallback, useRef, useState } from 'react'
import { apiService } from '../../../services/api'
import { TeacherEvent, StreamLessonRequest } from '../../../types'

export function useTeacherStream(params: {
  topic: string
  userId?: string
  onEvent: (event: TeacherEvent) => void
  onError?: (err: Error) => void
  onDone?: () => void
}) {
  const { topic, userId, onEvent, onError, onDone } = params
  const [isLoading, setIsLoading] = useState(false)
  const streamAbortRef = useRef<AbortController | undefined>(undefined)

  const startStreaming = useCallback(async () => {
    setIsLoading(true)
    try {
      const request: StreamLessonRequest = {
        topic,
        user_id: userId,
        session_id: `teacher_${userId || 'anon'}_${Date.now()}`,
        tts: true,
        language: 'en'
      }

      if (streamAbortRef.current) {
        streamAbortRef.current.abort()
      }
      streamAbortRef.current = new AbortController()

      await apiService.streamTeacherLesson({
        request,
        onEvent,
        onError: (e) => { setIsLoading(false); onError?.(e) },
        onDone: () => { setIsLoading(false); onDone?.() },
        signal: streamAbortRef.current?.signal
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        try { console.log('useTeacherStream: aborted') } catch {}
      } else {
        onError?.(err)
      }
      setIsLoading(false)
    }
  }, [topic, userId, onEvent, onError, onDone])

  const abort = useCallback(() => {
    if (streamAbortRef.current) streamAbortRef.current.abort()
  }, [])

  return { isLoading, startStreaming, abort }
}

export default useTeacherStream


