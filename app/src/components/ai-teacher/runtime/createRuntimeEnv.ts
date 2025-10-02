import React from 'react'

export function createRuntimeEnvironment(params: {
  getTimeSeconds: () => number
  getTimeline: () => Array<{ at: number; event: string }>
  getTopic: () => string | undefined
  getIsPlaying: () => boolean
}): Record<string, any> {
  const { getTimeSeconds, getTimeline, getTopic, getIsPlaying } = params

  const utils = {
    screen: {
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0
    },
    resolveImageUrl: (relativePath: string) => {
      const baseUrl = (typeof process !== 'undefined' && (process as any)?.env?.REACT_APP_ORCHESTRATOR_URL) || 'http://localhost:8003'
      return `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`
    }
  }

  const motion: any = {}
  Object.defineProperty(motion, 'time', { get() { return getTimeSeconds() || 0 } })
  motion.clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x))
  motion.lerp = (a: number, b: number, t: number) => a + (b - a) * t
  motion.easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  motion.phaseProgress = (phase: number | string) => {
    const events = (getTimeline() || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0))
    if (!events.length) return 0
    const currentT = getTimeSeconds() || 0
    let idx = -1
    if (typeof phase === 'number') {
      idx = phase
    } else {
      idx = events.findIndex(e => (e.event || '').toLowerCase().includes(String(phase).toLowerCase()))
    }
    if (idx < 0) idx = 1
    const start = events[idx]?.at ?? events[0].at
    const end = events[idx + 1]?.at ?? (start + 2)
    if (currentT <= start) return 0
    if (currentT >= end) return 1
    return (currentT - start) / Math.max(0.0001, (end - start))
  }

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
    const imgSrc = source?.uri || source
    const webStyle = {
      ...style,
      objectFit: resizeMode === 'contain' ? 'contain' : (resizeMode === 'cover' ? 'cover' : 'fill'),
      width: style?.width || '100%',
      height: style?.height || '100%',
    }
    return React.createElement('img', { src: imgSrc, style: webStyle, ...props })
  }

  const StyleSheet = { create: (styles: any) => styles }
  const Dimensions = { get: () => ({ width: typeof window !== 'undefined' ? window.innerWidth : 0, height: typeof window !== 'undefined' ? window.innerHeight : 0 }) }
  const Platform = { OS: 'web' }
  const Animated = {
    View,
    Text,
    Image,
    Value: (value: number) => ({ _value: value, getValue: () => value, setValue: (v: number) => { (Animated.Value as any)._value = v } }),
    timing: (value: any, config: any) => ({ start: (callback: Function) => { setTimeout(callback, config.duration || 0) } }),
    sequence: (animations: any[]) => ({ start: (callback: Function) => { animations.forEach(a => a.start(() => {})); setTimeout(callback, 0) } }),
    parallel: (animations: any[]) => ({ start: (callback: Function) => { Promise.all(animations.map(a => new Promise(res => a.start(res)))).then(() => callback()) } }),
    useRef: React.useRef,
    useEffect: React.useEffect,
    useState: React.useState,
  }

  const Svg = ({ children, ...props }: any) => React.createElement('svg', props, children)
  const Path = (props: any) => React.createElement('path', props)
  const Rect = (props: any) => React.createElement('rect', props)
  const Circle = (props: any) => React.createElement('circle', props)
  const Line = (props: any) => React.createElement('line', props)
  const Polygon = (props: any) => React.createElement('polygon', props)
  const SvgText = (props: any) => React.createElement('text', props)

  const MermaidDiagram = ({ code: diagramCode, ...props }: any) => {
    const containerStyle = { padding: '20px', textAlign: 'center', color: '#666', border: '1px dashed #ccc', margin: '20px' }
    const preStyle = { whiteSpace: 'pre-wrap', fontSize: '0.8em', margin: '10px 0' }
    return React.createElement(
      'div',
      { style: containerStyle, ...props },
      'Mermaid Diagram Placeholder:',
      React.createElement('br'),
      React.createElement('pre', { style: preStyle }, diagramCode),
      ' (Actual rendering not supported in this runtime)'
    )
  }

  return {
    React,
    View, Text, Image, StyleSheet, Dimensions, Platform, Animated,
    Svg, Path, Rect, Circle, Line, Polygon, SvgText,
    MermaidDiagram,
    utils,
    motion,
    props: {
      slide: { title: getTopic() },
      showCaptions: true,
      isPlaying: getIsPlaying(),
      timeSeconds: getTimeSeconds(),
      timeline: getTimeline(),
      motion,
      Svg, Path, Rect, Circle, Line, Polygon, SvgText,
    },
  }
}


