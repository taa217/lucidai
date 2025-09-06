import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createRoot, Root } from 'react-dom/client' // Import Root type
import { apiService } from '../../services/api'
import { RenderErrorReport } from '../../types'

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

// Error Boundary for the dynamically rendered component
class DynamicComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; onBoundaryError: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("CodeSlideRuntime: Error Boundary caught an error in dynamic component:", error, errorInfo)
    this.props.onBoundaryError(error)
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{
          padding: '20px',
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          color: '#dc2626',
          fontFamily: 'monospace',
          fontSize: '14px',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Component Error:</div>
          <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message || 'Unknown error occurred in component.'}
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
              Please refresh or wait for an automatic fix attempt.
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
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
  
  // Ref for the DOM container where React will render
  const containerRef = useRef<HTMLDivElement>(null)
  // Ref for the React root instance
  const reactRootRef = useRef<Root | null>(null)
  // Store the actual React component once it's successfully executed
  const [LessonComponent, setLessonComponent] = useState<React.ComponentType<any> | null>(null)

  const lastErrorHashRef = useRef<string>('')
  const lastReportTimeRef = useRef<number>(0)
  const isInitializedRef = useRef<boolean>(false)

  // Memoized props for the LessonComponent
  const componentProps = useMemo(() => ({
    slide: { title: topic },
    showCaptions: true,
    isPlaying,
    timeSeconds,
    timeline
  }), [topic, isPlaying, timeSeconds, timeline])

  // Error reporting with deduplication and throttling
  const reportError = useCallback(async (error: RuntimeError) => {
    const errorHash = `${error.message}-${error.stage}-${code.slice(0, 100)}`
    const now = Date.now()
    
    // Skip if same error reported recently (5s throttle)
    if (errorHash === lastErrorHashRef.current && now - lastReportTimeRef.current < 5000) {
      return
    }
    
    // Skip if already fixing (prevent infinite loops)
    if (isFixing) {
      return
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
      
      // Call your backend API to report the error (and potentially trigger auto-fix)
      await apiService.reportTeacherRenderError(report)
    } catch (reportError) {
      console.warn('CodeSlideRuntime: Failed to report render error:', reportError)
    } finally {
      setIsFixing(false) // Reset fixing state
    }
  }, [sessionId, userId, topic, code, timeline, isFixing])

  // Handle errors from the dynamic component's error boundary
  const handleDynamicComponentError = useCallback((error: Error) => {
    const runtimeError: RuntimeError = {
      message: error.message,
      stack: error.stack,
      stage: 'runtime'
    }
    setRenderError(runtimeError)
    onError?.(error) // Notify parent component
    reportError(runtimeError) // Report to backend
  }, [onError, reportError])

  // Compile TSX code to JavaScript
  const compileTsxCode = useCallback(async (tsxCode: string): Promise<string> => {
    if (!window.Babel) {
      throw new Error('Babel not loaded. Please ensure https://unpkg.com/@babel/standalone/babel.min.js is loaded.')
    }
    try {
      const result = window.Babel.transform(tsxCode, {
        filename: 'component.tsx',
        presets: ['react', 'typescript'],
      })
      return result.code
    } catch (error: any) {
      throw new Error(`Compilation failed: ${error.message || String(error)}`)
    }
  }, [])

  // Create runtime environment with available symbols
  const createRuntimeEnvironment = useCallback(() => {
    const utils = {
      screen: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      resolveImageUrl: (relativePath: string) => {
        const baseUrl = process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8003'
        return `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`
      }
    }

    // Mock React Native components for web (simplify to basic HTML elements)
    const View = ({ children, style, ...props }: any) => {
      const webStyle = style ? {
        ...style,
        display: style.flex || style.flexGrow || style.flexShrink || style.flexBasis ? 'flex' : style.display || 'block',
        flexDirection: style.flexDirection || 'column',
        alignItems: style.alignItems || 'stretch',
        justifyContent: style.justifyContent || 'flex-start',
        boxSizing: 'border-box',
      } : {}
      return React.createElement('div', { style: webStyle, ...props }, children)
    }

    const Text = ({ children, style, ...props }: any) => {
      const webStyle = style ? {
        ...style,
        display: 'inline',
        boxSizing: 'border-box',
      } : {}
      return React.createElement('span', { style: webStyle, ...props }, children)
    }

    const Image = ({ source, style, resizeMode, ...props }: any) => {
      const imgSrc = source?.uri || source;
      const webStyle = {
        ...style,
        objectFit: resizeMode === 'contain' ? 'contain' : (resizeMode === 'cover' ? 'cover' : 'fill'),
        width: style?.width || '100%',
        height: style?.height || '100%',
      };
      return React.createElement('img', { src: imgSrc, style: webStyle, ...props });
    }

    const StyleSheet = {
      create: (styles: any) => styles
    }

    const Dimensions = {
      get: (dimension: 'window' | 'screen') => ({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    const Platform = {
      OS: 'web'
    }

    // Basic Animated mock for web
    const Animated = {
      View: View,
      Text: Text,
      Image: Image,
      Value: (value: number) => ({ _value: value, getValue: () => value, setValue: (v: number) => { (Animated.Value as any)._value = v } }), // Basic mock for value
      timing: (value: any, config: any) => ({ start: (callback: Function) => { setTimeout(callback, config.duration || 0); } }),
      sequence: (animations: any[]) => ({ start: (callback: Function) => { animations.forEach(a => a.start(() => {})); setTimeout(callback, 0); } }),
      parallel: (animations: any[]) => ({ start: (callback: Function) => { Promise.all(animations.map(a => new Promise(res => a.start(res)))).then(() => callback()); } }),
      useRef: React.useRef, // Explicitly provide React.useRef for Animated.useRef cases
      useEffect: React.useEffect,
      useState: React.useState
    }

    // SVG primitives
    const Svg = ({ children, ...props }: any) => React.createElement('svg', props, children)
    const Path = (props: any) => React.createElement('path', props)
    const Rect = (props: any) => React.createElement('rect', props)
    const Circle = (props: any) => React.createElement('circle', props)
    const Line = (props: any) => React.createElement('line', props)
    const Polygon = (props: any) => React.createElement('polygon', props)
    const SvgText = (props: any) => React.createElement('text', props)

    // Mock MermaidDiagram component
    const MermaidDiagram = ({ code: diagramCode, ...props }: any) => (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666', border: '1px dashed #ccc', margin: '20px' }}>
        Mermaid Diagram Placeholder:<br/>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8em', margin: '10px 0' }}>{diagramCode}</pre>
        (Actual rendering not supported in this runtime)
      </div>
    )

    return {
      React,
      View, Text, Image, StyleSheet, Dimensions, Platform, Animated,
      Svg, Path, Rect, Circle, Line, Polygon, SvgText,
      MermaidDiagram,
      utils,
      props: { // These are the props explicitly available to the generated component
        slide: { title: topic },
        showCaptions: true,
        isPlaying,
        timeSeconds,
        timeline,
        Svg, Path, Rect, Circle, Line, Polygon, SvgText // Also pass SVG components directly
      }
    }
  }, [topic, isPlaying, timeSeconds, timeline]) // Dependencies for memoization

  // Execute compiled code safely and return the React component
  const executeCompiledCode = useCallback(async (compiledJsCode: string): Promise<React.ComponentType<any>> => {
    try {
      const env = createRuntimeEnvironment()
      
      // Create a mock module system for export default
      const module = { exports: {} as any };
      const exports = module.exports;

      // Create a function that returns the component
      // Use 'with' statement for exposing env variables safely (in a sandbox)
      // Note: 'with' is generally discouraged in modern JS, but common in sandboxed eval.
      const componentFactory = new Function(
        ...Object.keys(env), 
        'module', 
        'exports', 
        `
        try {
          ${compiledJsCode}
          
          // Try to get the default export from module.exports
          if (module.exports && typeof module.exports === 'function') {
            return module.exports;
          }
          if (module.exports && module.exports.default && typeof module.exports.default === 'function') {
            return module.exports.default;
          }
          // Fallback to a global 'Lesson' or '_default' if no module.exports
          if (typeof Lesson !== 'undefined' && typeof Lesson === 'function') {
            return Lesson;
          }
          if (typeof _default !== 'undefined' && typeof _default === 'function') {
            return _default;
          }
          throw new Error('No valid React component exported. Ensure it exports a function component.');
        } catch (error) {
          throw new Error('Runtime execution failed: ' + (error instanceof Error ? error.message : String(error)));
        }
        `
      )
      
      const Component = componentFactory(...Object.values(env), module, exports)
      
      if (typeof Component !== 'function' && !(Component.prototype && Component.prototype.isReactComponent)) {
        throw new Error('The executed code did not return a valid React component function or class.')
      }

      return Component
    } catch (error: any) {
      console.error('CodeSlideRuntime: Execute code error', error)
      throw new Error(`Execution environment setup failed: ${error.message || String(error)}`)
    }
  }, [createRuntimeEnvironment])

  // Effect to manage Babel loading
  useEffect(() => {
    if (window.Babel) {
      return // Babel already loaded
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@babel/standalone/babel.min.js'
    script.async = true
    script.onload = () => {
      console.log('CodeSlideRuntime: Babel loaded successfully.')
      // No need to trigger a recompile here, the main code effect will run
    }
    script.onerror = () => {
      console.error('CodeSlideRuntime: Failed to load Babel.')
      setRenderError({
        message: 'Failed to load Babel compiler. Check network or script URL.',
        stage: 'compile'
      })
    }
    document.head.appendChild(script)

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, []) // Empty dependency array means this runs once on mount

  // Main compilation and component management effect
  useEffect(() => {
    if (!code) {
      setLessonComponent(null) // No code, no component
      return
    }

    const processCode = async () => {
      setIsCompiling(true)
      setRenderError(null) // Clear previous errors
      setLessonComponent(null) // Clear previous component

      if (!window.Babel) {
        // If Babel isn't loaded yet, just show compiling state and wait for it
        console.log('CodeSlideRuntime: Babel not yet loaded, waiting...')
        // This effect will re-run when Babel loads
        return
      }

      try {
        const isPlaceholder = /Preparing\s+interactive\s+lesson/i.test(code) || /module\.exports\s*=\s*Lesson\s*;\s*function\s*Lesson\({/.test(code);
        if (isPlaceholder) {
          // If placeholder, use a simple internal component
          console.log('CodeSlideRuntime: Placeholder code detected, using internal fallback.')
          const FallbackVisuals: React.FC<any> = ({ slide, timeSeconds, timeline }) => {
            const activeEvents = timeline.filter((t: any) => (t?.at ?? 0) <= timeSeconds).map((t: any) => t.event)
            const showIntro = activeEvents.includes('intro') || activeEvents.length === 0
            const showBeat2 = activeEvents.some((e: any) => e.includes('reveal:1') || e.includes('reveal:main'))
            const showBeat3 = activeEvents.some((e: any) => e.includes('reveal:2'))
            const showBeat4 = activeEvents.some((e: any) => e.includes('reveal:3'))
            return (
              <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, system-ui, Arial', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: '#60a5fa', marginBottom: 16, opacity: showIntro ? 1 : 0.5, transition: 'opacity 0.5s ease' }}>{slide?.title || 'Lesson Topic'}</h1>
                {showIntro && <p style={{ opacity: 0.95, transition: 'opacity 0.5s ease' }}>Starting the lesson...</p>}
                <div style={{ marginTop: 24, width: '90%', maxWidth: '600px' }}>
                  <svg width="100%" height="220" viewBox="0 0 800 220" style={{ display: 'block' }}>
                    <rect x="0" y="0" width="800" height="220" rx="10" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                    <circle cx="120" cy="110" r="45" fill={showBeat2 ? '#22c55e' : '#475569'} style={{ transition: 'fill 0.5s ease' }} />
                    <rect x="200" y="70" width={showBeat3 ? 480 : 200} height="30" rx="8" fill="#475569" style={{ transition: 'width 0.5s ease' }} />
                    <rect x="200" y="115" width={showBeat4 ? 400 : 160} height="25" rx="8" fill="#334155" style={{ transition: 'width 0.5s ease' }} />
                    <rect x="200" y="150" width={showBeat4 ? 300 : 120} height="20" rx="8" fill="#334155" style={{ transition: 'width 0.5s ease' }} />
                    <text x="120" y="115" fontSize="20" textAnchor="middle" fill="#f8fafc">{showBeat2 ? '✅' : '...'}</text>
                    <text x="210" y="90" fontSize="16" fill="#f8fafc" style={{ opacity: showBeat3 ? 1 : 0.6, transition: 'opacity 0.5s ease' }}>{showBeat3 ? 'Core Concept' : 'Loading...'}</text>
                  </svg>
                </div>
              </div>
            )
          }
          setLessonComponent(() => FallbackVisuals) // Use a function to set state
          setCompiledJs(null) // No compiled JS for fallback
          onRenderComplete?.()
        } else {
          // Compile and execute actual AI-generated code
          console.log('CodeSlideRuntime: Compiling AI code...')
          const compiled = await compileTsxCode(code)
          setCompiledJs(compiled)
          const Component = await executeCompiledCode(compiled)
          setLessonComponent(() => Component) // Store the component function
          onRenderComplete?.()
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
        setLessonComponent(null) // Ensure no broken component is rendered
      } finally {
        setIsCompiling(false)
      }
    }

    processCode()
  }, [code, compileTsxCode, executeCompiledCode, onError, onRenderComplete, reportError])


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
        <DynamicComponentErrorBoundary onBoundaryError={handleDynamicComponentError}>
          {React.createElement(LessonComponent, componentProps)}
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


  if (renderError && !isFixing) {
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#fee', 
        border: '1px solid #fcc',
        borderRadius: '8px',
        color: '#c33',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
          Render Error ({renderError.stage})
        </div>
        <div style={{ fontSize: '14px', fontFamily: 'monospace', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
          {renderError.message}
        </div>
        {isFixing && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            Attempting to fix...
          </div>
        )}
      </div>
    )
  }

  // The actual render output of CodeSlideRuntime itself is just the container
  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '400px',
        // Optional: style the container background if component doesn't fill it
        backgroundColor: '#0f172a' 
      }}
    />
  )
}

export default CodeSlideRuntime