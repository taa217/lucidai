import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { apiService } from '../../services/api'
import { RenderErrorReport } from '../../types'
import DynamicComponentErrorBoundary from './runtime/DynamicComponentErrorBoundary'
import { useBabelReady } from './runtime/useBabel'
import { compileTsxCode } from './runtime/compileTsx'
import { createRuntimeEnvironment } from './runtime/createRuntimeEnv'
import { executeCompiledCode as execCompiled } from './runtime/executeCompiledCode'
import CinematicBackground from './runtime/CinematicBackground'
import FallbackVisuals from './runtime/FallbackVisuals'

// Import Babel standalone for TSX compilation
declare global {
  interface Window {
    Babel: any
  }
}

interface CodeSlideRuntimeProps {
  code: string
  sessionId: string
  userId?: string
  topic?: string
  timeline?: Array<{ at: number; event: string }>
  isPlaying?: boolean
  timeSeconds?: number
  onError?: (error: Error) => void
  onRenderComplete?: () => void
}

interface RuntimeError {
  message: string
  stack?: string
  filename?: string
  stage: 'compile' | 'render' | 'runtime'
}

export const CodeSlideRuntime: React.FC<CodeSlideRuntimeProps> = ({
  code,
  sessionId,
  userId,
  topic,
  timeline = [],
  isPlaying = false,
  timeSeconds = 0,
  onError,
  onRenderComplete
}) => {
  const [compiledJs, setCompiledJs] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<RuntimeError | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [isFixing, setIsFixing] = useState(false)
  const babelReady = useBabelReady()
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false)
  const [componentKey, setComponentKey] = useState(0)
  
  // Ref for the DOM container where React will render
  const containerRef = useRef<HTMLDivElement>(null)
  // Ref for the React root instance
  const reactRootRef = useRef<Root | null>(null)
  // Store the actual React component once it's successfully executed
  const [LessonComponent, setLessonComponent] = useState<React.ComponentType<any> | null>(null)

  const lastErrorHashRef = useRef<string>('')
  const lastReportTimeRef = useRef<number>(0)
  const isInitializedRef = useRef<boolean>(false)
  const usingFixedOverrideRef = useRef<boolean>(false)
  const prevCodeRef = useRef<string | null>(null)

  // Live refs for props that change frequently
  const timeSecondsRef = useRef<number>(timeSeconds || 0)
  const timelineRef = useRef<Array<{ at: number; event: string }>>(timeline || [])
  const topicRef = useRef<string | undefined>(topic)
  const isPlayingRef = useRef<boolean>(isPlaying || false)

  useEffect(() => { timeSecondsRef.current = timeSeconds || 0 }, [timeSeconds])
  useEffect(() => { timelineRef.current = (timeline || []) as Array<{ at: number; event: string }> }, [timeline])
  useEffect(() => { topicRef.current = topic }, [topic])
  useEffect(() => { isPlayingRef.current = !!isPlaying }, [isPlaying])

  // Memoized props for the LessonComponent
  const componentProps = useMemo(() => ({
    slide: { title: topic },
    showCaptions: true,
    isPlaying,
    timeSeconds,
    timeline
  }), [topic, isPlaying, timeSeconds, timeline])

  // Error reporting with deduplication and throttling
  const reportError = useCallback(async (error: RuntimeError): Promise<string | null> => {
    const errorHash = `${error.message}-${error.stage}-${code.slice(0, 100)}`
    const now = Date.now()
    
    // Skip if same error reported recently (5s throttle)
    if (errorHash === lastErrorHashRef.current && now - lastReportTimeRef.current < 5000) {
      try { console.log('CodeSlideRuntime: Skipping duplicate error report (throttled)', { error, errorHash }) } catch {}
      return null
    }
    
    // Skip if already fixing (prevent infinite loops)
    if (isFixing) {
      try { console.log('CodeSlideRuntime: Skipping error report because fix is in progress', { error }) } catch {}
      return null
    }

    lastErrorHashRef.current = errorHash
    lastReportTimeRef.current = now
    setIsFixing(true) // Indicate that a fix is in progress

    try {
      const report: RenderErrorReport = {
        sessionId, // Use sessionId for frontend type
        userId,
        topic,
        code,
        error: error.message,
        timeline,
        platform: 'web'
      }
      
      // Call backend to attempt auto-fix and optionally return fixed code
      try { console.log('CodeSlideRuntime: Reporting render error', { reportPreview: { message: report.error, codeLen: (report.code || '').length, topic: report.topic, sessionId: report.sessionId } }) } catch {}
      const res = await apiService.reportTeacherRenderError(report)
      try { console.log('CodeSlideRuntime: Report response', res) } catch {}
      const fixed = res.success ? (res.data?.fixedCode || null) : null
      return fixed
    } catch (reportError) {
      console.warn('CodeSlideRuntime: Failed to report render error:', reportError)
      return null
    } finally {
      setIsFixing(false) // Reset fixing state
    }
  }, [sessionId, userId, topic, code, timeline, isFixing])

  // Handle errors from the dynamic component's error boundary
  const handleDynamicComponentError = useCallback(async (error: Error) => {
    try { console.warn('CodeSlideRuntime: Dynamic component error', { message: error?.message }) } catch {}
    const runtimeError: RuntimeError = {
      message: error.message,
      stack: error.stack,
      stage: 'runtime'
    }
    setRenderError(runtimeError)
    onError?.(error) // Notify parent component
    const fixed = await reportError(runtimeError)
    if (fixed) {
      try {
        const compiled = await compileTsxCode(fixed)
        const env = buildEnv()
        const Component = await execCompiled(compiled, env)
        setLessonComponent(() => Component)
        usingFixedOverrideRef.current = true
        if (!hasRenderedOnce) setHasRenderedOnce(true)
        setRenderError(null)
      } catch (e) {
        // Keep current fallback/last good if fixed compile fails
      }
    }
  }, [onError, reportError])
  // Build runtime env on demand using current refs
  const buildEnv = useCallback(() => createRuntimeEnvironment({
    getTimeSeconds: () => timeSecondsRef.current || 0,
    getTimeline: () => (timelineRef.current || []) as Array<{ at: number; event: string }>,
    getTopic: () => topicRef.current,
    getIsPlaying: () => !!isPlayingRef.current,
  }), [])

  // Main compilation and component management effect
  useEffect(() => {
    if (!code) {
      try { console.log('CodeSlideRuntime: No code provided yet') } catch {}
      setLessonComponent(null) // No code, no component
      return
    }

    // Reset override when incoming code changes
    if (prevCodeRef.current !== code) {
      usingFixedOverrideRef.current = false
      prevCodeRef.current = code
      try { console.log('CodeSlideRuntime: Incoming code changed', { length: (code || '').length }) } catch {}
    }

    const processCode = async () => {
      setIsCompiling(true)
      setRenderError(null) // Clear previous errors
      // Keep the previous component on screen during recompilation to avoid jarring fallbacks

      // If we are using a fixed override for this exact code payload, skip reprocessing
      if (usingFixedOverrideRef.current) {
        setIsCompiling(false)
        return
      }

      if (!window.Babel || !babelReady) {
        // If Babel isn't loaded yet, just show compiling state and wait for it
        console.log('CodeSlideRuntime: Babel not yet loaded, waiting...')
        // This effect will re-run when Babel loads
        return
      }

      try {
        // Try to compile AI-generated code; on failure, fallback to internal visuals
        try {
          console.log('CodeSlideRuntime: Compiling AI code...')
          const compiled = await compileTsxCode(code)
          setCompiledJs(compiled)
          const env = buildEnv()
          const Component = await execCompiled(compiled, env)
          setLessonComponent(() => Component) // Store the component function
          setComponentKey(k => k + 1)
          if (!hasRenderedOnce) setHasRenderedOnce(true)
          onRenderComplete?.()
        } catch (compileErr: any) {
          console.warn('CodeSlideRuntime: Compilation failed, using internal fallback.', compileErr)
          // Lightweight telemetry to help diagnose frequent fallbacks
          try {
            const line1 = String(code || '').split('\n')[0] || ''
            console.info('CodeSlideRuntime: First line of AI code:', line1.slice(0, 160))
          } catch {}
          // Only show fallback if we have never rendered successfully yet; otherwise keep last good frame
          if (!hasRenderedOnce) {
            setLessonComponent(() => FallbackVisuals)
          }
          setCompiledJs(null) // No compiled JS for fallback
          onRenderComplete?.()
          const runtimeError: RuntimeError = { message: compileErr?.message || 'Compilation failed', stage: 'compile' }
          setRenderError(runtimeError)
          onError?.(compileErr)
          // Try immediate server-side fixed code and second-chance compile
          const fixed = await reportError(runtimeError)
          if (fixed) {
            try { console.log('CodeSlideRuntime: Received fixed code', { length: (fixed || '').length, head: (fixed || '').slice(0, 120) }) } catch {}
            try {
              const compiled2 = await compileTsxCode(fixed)
              const env2 = buildEnv()
              const Component2 = await execCompiled(compiled2, env2)
              setLessonComponent(() => Component2)
              setComponentKey(k => k + 1)
              usingFixedOverrideRef.current = true
              if (!hasRenderedOnce) setHasRenderedOnce(true)
              setRenderError(null)
              return
            } catch (e) {
              // If fixed compile fails, keep fallback/last good
            }
          }
        }
      } catch (error: any) {
        console.error('CodeSlideRuntime: Error during initial code processing:', error)
        const runtimeError: RuntimeError = {
          message: error.message,
          stack: error.stack,
          stage: 'compile'
        }
        setRenderError(runtimeError)
        onError?.(error)
        reportError(runtimeError)
        // Keep last known-good component if we had one; avoid blank/flicker after first success
        if (!hasRenderedOnce) {
          setLessonComponent(() => FallbackVisuals)
        }
      } finally {
        setIsCompiling(false)
      }
    }

    processCode()
  }, [code, babelReady, hasRenderedOnce])

  // Watchdog: if compilation takes too long or Babel is slow, show cinematic fallback immediately
  useEffect(() => {
    if (!code || hasRenderedOnce) return
    let cancelled = false
    const timeout = setTimeout(() => {
      if (cancelled) return
      // Only before first successful render, present fallback to avoid blank screen
      if (!LessonComponent) {
        try { console.log('CodeSlideRuntime: Watchdog triggered → showing fallback visuals') } catch {}
        setLessonComponent(() => FallbackVisuals)
      }
    }, 2000)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [code, LessonComponent, FallbackVisuals, hasRenderedOnce])

  // On runtime/render errors, immediately swap to fallback visuals instead of error box
  useEffect(() => {
    if (renderError && !isFixing) {
      if (!hasRenderedOnce) {
        setLessonComponent(() => FallbackVisuals)
      }
      // After first render, keep last good component while fixer runs
    }
  }, [renderError, isFixing, FallbackVisuals, hasRenderedOnce])


  // Effect to initialize React Root once and render the current LessonComponent
  useEffect(() => {
    if (!containerRef.current) return;

    if (!reactRootRef.current) {
      console.log('CodeSlideRuntime: Initializing React Root.')
      reactRootRef.current = createRoot(containerRef.current);
    }

    // This effect ensures the root is always rendering SOMETHING
    // It will re-render whenever LessonComponent or componentProps changes
    if (LessonComponent) {
      reactRootRef.current.render(
        <DynamicComponentErrorBoundary key={componentKey} onBoundaryError={handleDynamicComponentError} fallback={
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }}>
              {React.createElement(FallbackVisuals, componentProps)}
            </div>
          </div>
        }>
          <div style={{ position: 'absolute', inset: 0 }}>
            <CinematicBackground t={timeSeconds || 0} />
            <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }}>
              {React.createElement(LessonComponent, componentProps)}
            </div>
          </div>
        </DynamicComponentErrorBoundary>
      );
    } else {
      // Render a loading or initial state if no LessonComponent is ready
      reactRootRef.current.render(
        <div style={{ padding: '20px', textAlign: 'center', color: '#666', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
          {isCompiling ? 'Compiling visuals...' : (renderError ? 'Error, attempting to fix...' : 'Waiting for lesson content...')}
        </div>
      );
    }
  }, [LessonComponent, componentProps, isCompiling, renderError, handleDynamicComponentError]);


  // Cleanup effect for React Root
  useEffect(() => {
    return () => {
      if (reactRootRef.current) {
        console.log('CodeSlideRuntime: Unmounting React Root.')
        // Schedule a microtask to unmount, allowing any pending renders to complete
        Promise.resolve().then(() => {
          if (reactRootRef.current) {
            reactRootRef.current.unmount();
            reactRootRef.current = null;
          }
        });
      }
    };
  }, []); // Empty dependency array means this runs only on unmount


  // Always render the container; errors trigger cinematic fallback via LessonComponent

  // The actual render output of CodeSlideRuntime itself is just the container
  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'absolute',
        inset: 0,
        width: '100%', 
        height: '100%',
        minHeight: '500px',
        backgroundColor: '#0f172a' 
      }}
    />
  )
}

export default CodeSlideRuntime