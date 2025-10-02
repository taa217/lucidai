import { useCallback, useEffect, useRef, useState } from 'react'

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentAudioUrlRef = useRef<string | null>(null)
  const lastPlayRequestAtRef = useRef<number>(0)
  const playTokenRef = useRef<number>(0)
  const timeIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const [isPlaying, setIsPlaying] = useState(false)
  const [timeSeconds, setTimeSeconds] = useState(0)
  const [showReplay, setShowReplay] = useState(false)

  const startTimeTracking = useCallback(() => {
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current)
    timeIntervalRef.current = setInterval(() => {
      if (audioRef.current) {
        const newTime = audioRef.current.currentTime
        setTimeSeconds(prevTime => {
          const diff = Math.abs(newTime - prevTime)
          return diff > 0.1 ? newTime : prevTime
        })
      }
    }, 100)
  }, [])

  const stopTimeTracking = useCallback(() => {
    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current)
      timeIntervalRef.current = undefined
    }
  }, [])

  const playAudio = useCallback((audioUrl: string) => {
    try { console.log('useAudioPlayer:playAudio', { audioUrl }) } catch {}
    if (currentAudioUrlRef.current === audioUrl && audioRef.current) {
      audioRef.current.play().catch((err) => {
        if (String(err?.name) !== 'AbortError') {
          console.error('Failed to resume audio:', err)
        }
      })
      return
    }

    const token = ++playTokenRef.current

    if (audioRef.current) {
      try { audioRef.current.pause() } catch {}
      try { audioRef.current.currentTime = 0 } catch {}
    }

    const audio = new Audio(audioUrl)
    try { (audio as any).playsInline = true } catch {}
    audio.preload = 'auto'
    audio.autoplay = true
    audioRef.current = audio
    currentAudioUrlRef.current = audioUrl

    audio.addEventListener('play', () => {
      if (playTokenRef.current !== token) return
      try { console.log('useAudioPlayer:audio:play') } catch {}
      setIsPlaying(true)
      startTimeTracking()
    })

    audio.addEventListener('pause', () => {
      if (playTokenRef.current !== token) return
      try { console.log('useAudioPlayer:audio:pause') } catch {}
      setIsPlaying(false)
      stopTimeTracking()
    })

    audio.addEventListener('ended', () => {
      if (playTokenRef.current !== token) return
      try { console.log('useAudioPlayer:audio:ended') } catch {}
      setIsPlaying(false)
      setShowReplay(true)
      stopTimeTracking()
    })

    audio.addEventListener('error', (e) => {
      if (playTokenRef.current !== token) return
      console.error('Audio playback error:', e)
      setIsPlaying(false)
      stopTimeTracking()
    })

    audio.play().catch(err => {
      if (String(err?.name) === 'AbortError') {
        return
      }
      console.error('Failed to play audio:', err)
      setIsPlaying(false)
    })
  }, [startTimeTracking, stopTimeTracking])

  const requestPlay = useCallback((audioUrl: string) => {
    const now = Date.now()
    if (now - lastPlayRequestAtRef.current > 250) {
      lastPlayRequestAtRef.current = now
      setTimeout(() => playAudio(audioUrl), 120)
    }
  }, [playAudio])

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(err => { console.error('Failed to resume audio:', err) })
    }
  }, [isPlaying])

  const replay = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(err => { console.error('Failed to replay audio:', err) })
    }
    setShowReplay(false)
    setTimeSeconds(0)
  }, [])

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause() } catch {}
    }
    stopTimeTracking()
  }, [stopTimeTracking])

  useEffect(() => () => cleanup(), [cleanup])

  return {
    // state
    isPlaying,
    timeSeconds,
    showReplay,
    // methods
    requestPlay,
    playAudio,
    togglePlayPause,
    replay,
    cleanup,
  }
}

export default useAudioPlayer


