import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View, Text, Image, StyleSheet, Dimensions, Animated as RNAnimated, TouchableOpacity } from 'react-native';
import { Svg, Path, Rect, Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import MermaidDiagram from './MermaidDiagram';
// Auto-fix disabled: we no longer call backend fixer from the runtime.

// Minimal utilities we expose to slide code
// Prefer orchestrator base (serves /storage/* assets)
const ORCH_BASE_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8003';
const utils = {
  screen: Dimensions.get('window'),
  resolveImageUrl: (url?: string) => {
    if (!url) return url;
    if (url.startsWith('http')) return url;
    // If it's a storage path, ensure it hits the orchestrator host
    if (url.startsWith('/storage/')) return `${ORCH_BASE_URL}${url}`;
    return `${ORCH_BASE_URL}${url}`;
  },
};

type CodeSlideRuntimeProps = {
  code: string;
  // Provide the same props that SlideRenderer uses
  slide: any;
  showCaptions: boolean;
  isPlaying: boolean;
  // Additional live playback context
  timeSeconds?: number;
  timeline?: any[];
  wordTimestamps?: { word: string; start: number; end: number }[];
  onReadyChange?: (ready: boolean) => void;
  onRetry?: () => void;
};

const CodeSlideRuntime: React.FC<CodeSlideRuntimeProps> = ({ code, slide, showCaptions, isPlaying, timeSeconds, timeline, wordTimestamps, onReadyChange, onRetry }) => {
  const [fixedCode, setFixedCode] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState<boolean>(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  // De-dupe and throttle error reporting to avoid flicker and spam
  const fixInFlightRef = React.useRef<Promise<any> | null>(null);
  const reportedErrorsRef = React.useRef<Map<string, number>>(new Map());
  const reportCountsRef = React.useRef<Map<string, number>>(new Map());
  const REPORT_TTL_MS = 5000; // don't re-report same error within 5s
  const MAX_REPORTS_PER_CODE = 3; // cap per unique code hash

  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return String(hash);
  };

  const shouldReportError = (codeStr: string, err: unknown, stage: string) => {
    const msg = String((err as any)?.message || err || 'unknown');
    const codeHash = hashString(codeStr);
    const key = `${codeHash}|${stage}|${msg}`;
    const now = Date.now();
    const last = reportedErrorsRef.current.get(key) || 0;
    if (now - last < REPORT_TTL_MS) return false;
    const countKey = `${codeHash}`;
    const count = reportCountsRef.current.get(countKey) || 0;
    if (count >= MAX_REPORTS_PER_CODE) return false;
    reportedErrorsRef.current.set(key, now);
    reportCountsRef.current.set(countKey, count + 1);
    return true;
  };
  // Native platforms don't support runtime TSX compilation; show a notice
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>
          Code-driven slides are supported on Web only. Falling back to default rendering.
        </Text>
      </View>
    );
  }

  const element = useMemo(() => {
    try {
      // Lazily require to avoid bundling on native
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Babel = require('@babel/standalone');
      const transformed = Babel.transform(fixedCode ?? code, {
        // Transform modules so `export default` becomes CommonJS exports
        presets: [
          ["env", { modules: "commonjs" }],
          ["react", { /* classic runtime so React is required in scope */ }],
          ["typescript", { isTSX: true, allExtensions: true }],
        ],
        sourceType: 'module',
        filename: 'SlideRuntime.tsx',
      }).code as string;

      // Create a function with scoped symbols available to the code
      const factory = new Function(
        'React',
        'View',
        'Text',
        'Image',
        'Animated',
        'StyleSheet',
        'Dimensions',
        'Platform',
        // SVG primitives for code-drawn diagrams
        'Svg',
        'Path',
        'Rect',
        'Circle',
        'Line',
        'Polygon',
        'SvgText',
        'MermaidDiagram',
        'utils',
        'exports',
        'module',
        'require',
        'props',
        `${transformed}; const Comp = (module && module.exports && module.exports.default) || (exports && (exports.default || (exports.Component))) || (typeof _default === 'function' ? _default : (typeof Component === 'function' ? Component : null)); return (typeof Comp === 'function') ? Comp(props) : null;`
      );

      // Provide a namespace-like Svg that supports <Svg.Rect/> usage
      const SvgNS = Object.assign(
        (props: any) => React.createElement(Svg as any, props),
        { Path, Rect, Circle, Line, Polygon, Text: SvgText }
      );

      return factory(
        React,
        View,
        Text,
        Image,
        RNAnimated,
        StyleSheet,
        Dimensions,
        Platform,
        SvgNS as any,
        Path,
        Rect,
        Circle,
        Line,
        Polygon,
        SvgText,
        MermaidDiagram,
        utils,
        {},
        { exports: {} as any },
        (() => { throw new Error('require is disabled in CodeSlideRuntime'); }) as any,
        { 
          slide, showCaptions, isPlaying, timeSeconds, timeline, wordTimestamps,
          // Provide components in props as well, so user code can destructure from props
          Svg: SvgNS as any, Path, Rect, Circle, Line, Polygon, SvgText,
          MermaidDiagram,
          View, Text, Image, Animated: RNAnimated,
        }
      );
    } catch (error) {
      console.error('CodeSlideRuntime error:', error);
      const currentCode = fixedCode ?? code ?? '';
      if (shouldReportError(currentCode, error, 'runtime')) {
        setFatalError('Check internet connection');
        try { onReadyChange?.(false); } catch {}
      }
      return null;
    }
  }, [code, fixedCode, slide, showCaptions, isPlaying, timeSeconds, timeline, wordTimestamps]);

  const [attemptedFix, setAttemptedFix] = useState(false);
  useEffect(() => {
    if (!element && Platform.OS === 'web' && !attemptedFix) {
      setAttemptedFix(true);
      setFatalError(prev => prev || 'Check internet connection');
      try { onReadyChange?.(false); } catch {}
    }
  }, [element, attemptedFix, code, fixedCode, slide, timeline]);

  // Proactively trigger auto-fix when placeholder code renders successfully
  useEffect(() => {
    // Placeholder auto-upgrade disabled.
    return;
  }, [code, fixedCode, attemptedFix, slide, timeline]);

  // Notify parent of readiness (element exists and code is not the placeholder)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const src = (fixedCode ?? code ?? '').toLowerCase();
    const isPlaceholder = src.includes('preparing visuals');
    const ready = !!element && !isPlaceholder;
    try { onReadyChange?.(ready); } catch {}
    try { (window as any).__teacherFixing = false; } catch {}
  }, [element, code, fixedCode, onReadyChange, isFixing]);

  const srcLower = (fixedCode ?? code ?? '').toLowerCase();
  const isPlaceholder = srcLower.includes('preparing visuals');

  if (!element || fatalError || isPlaceholder) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>{fatalError ? fatalError : (isPlaceholder ? 'Check internet connection' : 'Waiting for teacher content…')}</Text>
        {fatalError ? (
          <TouchableOpacity onPress={() => { try { onRetry?.(); } catch {} }} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : isPlaceholder ? (
          <TouchableOpacity onPress={() => { try { onRetry?.(); } catch {} }} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return <>{element}</>;
};

const styles = StyleSheet.create({
  fallbackContainer: {
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  fallbackText: {
    color: '#e5e7eb',
    marginBottom: 6,
  },
  errorText: {
    color: '#fca5a5',
  },
  retryButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#1f6feb',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default CodeSlideRuntime;


