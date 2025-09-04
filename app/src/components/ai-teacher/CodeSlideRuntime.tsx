import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { apiService } from '../../services/api'
import { TeacherEvent, RenderErrorReport } from '../../types'

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
  const [compiledCode, setCompiledCode] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<RuntimeError | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [isFixing, setIsFixing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<any>(null)
  const usingFallbackRef = useRef<boolean>(false)
  const errorReportTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastErrorHashRef = useRef<string>('')
  const lastReportTimeRef = useRef<number>(0)

  // Error reporting with deduplication and throttling
  const reportError = useCallback(async (error: RuntimeError) => {
    const errorHash = `${error.message}-${error.stage}-${code.slice(0, 100)}`
    const now = Date.now()
    
    // Skip if same error reported recently (5s throttle)
    if (errorHash === lastErrorHashRef.current && now - lastReportTimeRef.current < 5000) {
      return
    }
    
    // Skip if already fixing
    if (isFixing) {
      return
    }

    lastErrorHashRef.current = errorHash
    lastReportTimeRef.current = now
    setIsFixing(true)

    try {
      const report: RenderErrorReport = {
        sessionId,
        userId,
        topic,
        code,
        error: error.message,
        timeline,
        platform: 'web'
      }

      await apiService.reportTeacherRenderError(report)
    } catch (reportError) {
      console.warn('Failed to report render error:', reportError)
    } finally {
      setIsFixing(false)
    }
  }, [sessionId, userId, topic, code, timeline, isFixing])

  // Compile TSX code to JavaScript
  const compileCode = useCallback(async (tsxCode: string) => {
    if (!window.Babel) {
      throw new Error('Babel not loaded')
    }

    try {
      const result = window.Babel.transform(tsxCode, {
        filename: 'component.tsx', // Required for presets
        presets: ['react', 'typescript'],
        plugins: [
          // Add any necessary plugins
        ]
      })
      return result.code
    } catch (error: any) {
      throw new Error(`Compilation failed: ${error.message}`)
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
        // Resolve relative image URLs to the orchestrator base URL
        const baseUrl = process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:8003'
        return `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`
      }
    }

    // Mock React Native components for web
    const View = ({ children, style, ...props }: any) => {
      // Convert React Native style properties to web CSS
      const webStyle = style ? {
        ...style,
        // Convert flex properties to web equivalents
        display: style.flex ? 'flex' : style.display || 'block',
        flexDirection: style.flexDirection || 'column',
        alignItems: style.alignItems || 'stretch',
        justifyContent: style.justifyContent || 'flex-start',
        // Ensure proper box model
        boxSizing: 'border-box',
        // Convert React Native colors to web
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        padding: style.padding,
        margin: style.margin,
        border: style.border,
        borderRadius: style.borderRadius,
        width: style.width,
        height: style.height,
        minHeight: style.minHeight,
        maxWidth: style.maxWidth,
        textAlign: style.textAlign,
        lineHeight: style.lineHeight,
      } : {}
      
      return (
        <div style={webStyle} {...props}>
          {children}
        </div>
      )
    }

    const Text = ({ children, style, ...props }: any) => {
      const webStyle = style ? {
        ...style,
        display: 'inline',
        boxSizing: 'border-box',
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        textAlign: style.textAlign,
        lineHeight: style.lineHeight,
        margin: style.margin,
        padding: style.padding,
      } : {}
      
      return (
        <span style={webStyle} {...props}>
          {children}
        </span>
      )
    }

    const Image = ({ source, style, resizeMode, ...props }: any) => (
      <img 
        src={source?.uri || source} 
        style={{ 
          ...style, 
          objectFit: resizeMode === 'contain' ? 'contain' : 'cover' 
        }} 
        {...props} 
      />
    )

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

    // Mock Animated for web
    const Animated = {
      View: View,
      Text: Text,
      Image: Image,
      Value: (value: number) => ({ _value: value }),
      timing: () => ({ start: () => {} }),
      sequence: () => ({ start: () => {} }),
      parallel: () => ({ start: () => {} }),
      useRef: React.useRef,
      useEffect: React.useEffect,
      useState: React.useState
    }

    // SVG primitives
    const Svg = ({ children, width, height, viewBox, style, ...props }: any) => (
      <svg width={width} height={height} viewBox={viewBox} style={style} {...props}>
        {children}
      </svg>
    )

    const Path = ({ d, fill, stroke, strokeWidth, ...props }: any) => (
      <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...props} />
    )

    const Rect = ({ x, y, width, height, fill, stroke, strokeWidth, ...props }: any) => (
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...props} />
    )

    const Circle = ({ cx, cy, r, fill, stroke, strokeWidth, ...props }: any) => (
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...props} />
    )

    const Line = ({ x1, y1, x2, y2, stroke, strokeWidth, ...props }: any) => (
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} {...props} />
    )

    const Polygon = ({ points, fill, stroke, strokeWidth, ...props }: any) => (
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...props} />
    )

    const SvgText = ({ x, y, children, fill, fontSize, ...props }: any) => (
      <text x={x} y={y} fill={fill} fontSize={fontSize} {...props}>
        {children}
      </text>
    )

    // Mock MermaidDiagram component
    const MermaidDiagram = ({ code, ...props }: any) => (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        Mermaid Diagram: {code}
      </div>
    )

    // Props for the component
    const props = {
      slide: { title: topic },
      showCaptions: true,
      isPlaying,
      timeSeconds,
      timeline
    }

    return {
      React,
      // Only provide basic HTML elements and SVG
      Svg,
      Path,
      Rect,
      Circle,
      Line,
      Polygon,
      SvgText,
      MermaidDiagram,
      utils,
      props
    }
  }, [topic, isPlaying, timeSeconds, timeline])

  // Execute compiled code safely
  const executeCode = useCallback(async (compiledJs: string) => {
    try {
      console.log('CodeSlideRuntime: Creating runtime environment')
      const env = createRuntimeEnvironment()
      
      // Create a mock module system for export default
      const module = { exports: {} };
      const exports = module.exports;
      
      console.log('CodeSlideRuntime: Creating component factory with compiled JS')
      console.log('CodeSlideRuntime: Available environment keys:', Object.keys(env))
      console.log('CodeSlideRuntime: Component types:', {
        Svg: typeof env.Svg,
        Rect: typeof env.Rect,
        Circle: typeof env.Circle,
        Line: typeof env.Line,
        Polygon: typeof env.Polygon,
        SvgText: typeof env.SvgText
      })
      
      // Create a function that returns the component
      const componentFactory = new Function(
        ...Object.keys(env),
        'module',
        'exports',
        `
        try {
          console.log('CodeSlideRuntime: Executing compiled JS in runtime');
          console.log('CodeSlideRuntime: Available components in runtime:', {
            Svg: typeof Svg,
            Rect: typeof Rect,
            Circle: typeof Circle,
            Line: typeof Line,
            Polygon: typeof Polygon,
            SvgText: typeof SvgText
          });
          
          ${compiledJs}
          
          console.log('CodeSlideRuntime: Checking for exports', { 
            moduleExports: typeof module.exports, 
            moduleExportsDefault: typeof module.exports?.default,
            hasDefault: typeof _default !== 'undefined',
            hasComponent: typeof Component !== 'undefined'
          });
          
          // Try to get the default export from module.exports
          if (module.exports && typeof module.exports === 'function') {
            console.log('CodeSlideRuntime: Found function in module.exports');
            return module.exports;
          }
          if (module.exports && module.exports.default && typeof module.exports.default === 'function') {
            console.log('CodeSlideRuntime: Found function in module.exports.default');
            return module.exports.default;
          }
          if (typeof _default !== 'undefined') {
            console.log('CodeSlideRuntime: Found _default variable');
            return _default;
          }
          if (typeof Component !== 'undefined') {
            console.log('CodeSlideRuntime: Found Component variable');
            return Component;
          }
          throw new Error('No default export found');
        } catch (error) {
          console.error('CodeSlideRuntime: Runtime execution error', error);
          throw new Error('Runtime error: ' + error.message);
        }
        `
      )

      console.log('CodeSlideRuntime: Calling component factory')
      const Component = componentFactory(...Object.values(env), module, exports)
      
      console.log('CodeSlideRuntime: Component factory result', { Component: typeof Component })
      
      if (typeof Component !== 'function') {
        throw new Error('Component is not a function')
      }

      return Component
    } catch (error: any) {
      console.error('CodeSlideRuntime: Execute code error', error)
      throw new Error(`Execution failed: ${error.message}`)
    }
  }, [createRuntimeEnvironment])

  // Main compilation and rendering effect
  useEffect(() => {
    if (!code || !window.Babel) {
      return
    }

    const processCode = async () => {
      console.log('CodeSlideRuntime: Starting to process code', { code: code?.slice(0, 100) + '...' })
      setIsCompiling(true)
      setRenderError(null)

      try {
        // Fallback path: if code looks like placeholder, render built-in visuals synced to timeline
        const isPlaceholder = /Preparing\s+interactive\s+lesson/i.test(code)
        if (isPlaceholder) {
          console.log('CodeSlideRuntime: Using fallback visuals (placeholder code detected)')
          usingFallbackRef.current = true
          // Mount root if needed
          if (containerRef.current) {
            if (rootRef.current) {
              try { rootRef.current.unmount() } catch {}
              rootRef.current = null
            }
            rootRef.current = createRoot(containerRef.current)

            const FallbackLesson: React.FC<{ title?: string; timeSeconds: number; timeline: Array<{ at: number; event: string }> }> = ({ title, timeSeconds, timeline }) => {
              // Determine which events have fired
              const activeEvents = timeline.filter(t => (t?.at ?? 0) <= timeSeconds).map(t => t.event)
              const showIntro = activeEvents.includes('intro') || activeEvents.length === 0
              const showMain = activeEvents.some(e => e.includes('reveal'))
              return (
                <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, system-ui, Arial' }}>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>{title || 'Lesson'}</h1>
                  {showIntro ? (
                    <div style={{ opacity: 0.95, transition: 'opacity 400ms ease' }}>Starting the lesson…</div>
                  ) : null}
                  <div style={{ marginTop: 16 }}>
                    <svg width="100%" height="220" viewBox="0 0 800 220">
                      <rect x="0" y="0" width="800" height="220" fill="#0b1220" stroke="#1f2a44" />
                      <circle cx="120" cy="110" r="38" fill={showMain ? '#22c55e' : '#334155'} />
                      <rect x="200" y="72" width={showMain ? 420 : 180} height="28" rx="6" fill="#334155" />
                      <rect x="200" y="112" width={showMain ? 360 : 140} height="24" rx="6" fill="#1f2a44" />
                      <rect x="200" y="146" width={showMain ? 300 : 100} height="18" rx="6" fill="#1f2a44" />
                    </svg>
                  </div>
                </div>
              )
            }

            rootRef.current.render(
              React.createElement(FallbackLesson, { title: topic, timeSeconds, timeline })
            )
            onRenderComplete?.()
            return
          }
        } else {
          usingFallbackRef.current = false
        }

        // Compile TSX to JS
        console.log('CodeSlideRuntime: Compiling TSX code')
        const compiled = await compileCode(code)
        console.log('CodeSlideRuntime: Compiled successfully', { compiled: compiled?.slice(0, 200) + '...' })
        setCompiledCode(compiled)

        // Execute the compiled code
        console.log('CodeSlideRuntime: Executing compiled code')
        const Component = await executeCode(compiled)
        console.log('CodeSlideRuntime: Component created', { Component: typeof Component })
        
        // Render the component
        if (containerRef.current && Component) {
          console.log('CodeSlideRuntime: Rendering component')
          
          // Properly unmount existing root before clearing
          if (rootRef.current) {
            try {
              rootRef.current.unmount()
            } catch (error) {
              console.log('CodeSlideRuntime: Error unmounting root (expected):', error)
            }
            rootRef.current = null
          }
          
          // Do not manually clear innerHTML; React unmount handles DOM cleanup safely
          
          // Create new root
          rootRef.current = createRoot(containerRef.current)
          
          const props = {
            slide: { title: topic },
            showCaptions: true,
            isPlaying,
            timeSeconds,
            timeline
          }

          // Create an error boundary wrapper
          const ErrorBoundary = ({ children }: { children: React.ReactNode }): React.ReactElement => {
            const [hasError, setHasError] = React.useState(false)
            const [error, setError] = React.useState<Error | null>(null)

            React.useEffect(() => {
              const handleError = (error: ErrorEvent) => {
                console.error('CodeSlideRuntime: Component error caught:', error)
                setHasError(true)
                setError(new Error(error.message))
              }

              window.addEventListener('error', handleError)
              return () => window.removeEventListener('error', handleError)
            }, [])

            if (hasError) {
              return React.createElement('div', {
                style: {
                  padding: '20px',
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontFamily: 'monospace',
                  fontSize: '14px'
                }
              }, [
                React.createElement('div', { key: 'title', style: { fontWeight: 'bold', marginBottom: '10px' } }, 'Component Error:'),
                React.createElement('div', { key: 'error' }, error?.message || 'Unknown error occurred')
              ])
            }

            return React.createElement(React.Fragment, null, children)
          }

          // Render the component with error boundary
          rootRef.current.render(
            React.createElement(ErrorBoundary, null,
              React.createElement(Component, props)
            )
          )
          console.log('CodeSlideRuntime: Component rendered successfully')
          onRenderComplete?.()
        } else {
          console.log('CodeSlideRuntime: Cannot render - missing container or component', { 
            hasContainer: !!containerRef.current, 
            hasComponent: !!Component 
          })
        }
      } catch (error: any) {
        console.error('CodeSlideRuntime: Error processing code', error)
        const runtimeError: RuntimeError = {
          message: error.message,
          stack: error.stack,
          stage: 'compile'
        }
        setRenderError(runtimeError)
        onError?.(error)
        
        // Report error for auto-fix
        await reportError(runtimeError)
      } finally {
        setIsCompiling(false)
      }
    }

    processCode()
  }, [code, compileCode, executeCode, onError, onRenderComplete, reportError])

  // Re-render fallback when time or timeline changes
  useEffect(() => {
    if (!usingFallbackRef.current || !rootRef.current) return
    const FallbackLesson: React.FC<{ title?: string; timeSeconds: number; timeline: Array<{ at: number; event: string }> }> = ({ title, timeSeconds, timeline }) => {
      const activeEvents = timeline.filter(t => (t?.at ?? 0) <= timeSeconds).map(t => t.event)
      const showIntro = activeEvents.includes('intro') || activeEvents.length === 0
      const showMain = activeEvents.some(e => e.includes('reveal'))
      return (
        <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', minHeight: '400px', fontFamily: 'Inter, system-ui, Arial' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>{title || 'Lesson'}</h1>
          {showIntro ? (
            <div style={{ opacity: 0.95, transition: 'opacity 400ms ease' }}>Starting the lesson…</div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <svg width="100%" height="220" viewBox="0 0 800 220">
              <rect x="0" y="0" width="800" height="220" fill="#0b1220" stroke="#1f2a44" />
              <circle cx="120" cy="110" r="38" fill={showMain ? '#22c55e' : '#334155'} />
              <rect x="200" y="72" width={showMain ? 420 : 180} height="28" rx="6" fill="#334155" />
              <rect x="200" y="112" width={showMain ? 360 : 140} height="24" rx="6" fill="#1f2a44" />
              <rect x="200" y="146" width={showMain ? 300 : 100} height="18" rx="6" fill="#1f2a44" />
            </svg>
          </div>
        </div>
      )
    }
    rootRef.current.render(
      React.createElement(FallbackLesson, { title: topic, timeSeconds, timeline })
    )
  }, [timeSeconds, timeline, topic])

  // Load Babel if not already loaded
  useEffect(() => {
    if (window.Babel) {
      return
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@babel/standalone/babel.min.js'
    script.onload = () => {
      console.log('Babel loaded successfully')
    }
    script.onerror = () => {
      console.error('Failed to load Babel')
      setRenderError({
        message: 'Failed to load Babel compiler',
        stage: 'compile'
      })
    }
    document.head.appendChild(script)

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  // Cleanup timeout and root on unmount
  useEffect(() => {
    return () => {
      if (errorReportTimeoutRef.current) {
        clearTimeout(errorReportTimeoutRef.current)
      }
      if (rootRef.current) {
        try {
          rootRef.current.unmount()
        } catch (error) {
          console.log('CodeSlideRuntime: Error during cleanup (expected):', error)
        } finally {
          rootRef.current = null
        }
      }
    }
  }, [])

  if (renderError) {
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#fee', 
        border: '1px solid #fcc',
        borderRadius: '8px',
        color: '#c33'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
          Render Error ({renderError.stage})
        </div>
        <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
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

  if (isCompiling) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center',
        color: '#666'
      }}>
        Compiling visuals...
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '400px'
      }}
    />
  )
}

export default CodeSlideRuntime
