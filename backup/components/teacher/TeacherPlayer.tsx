import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import CodeSlideRuntime from '../slides/CodeSlideRuntime';
import { getServiceUrl } from '../../services/config';

type TeacherEvent = {
  type: 'start' | 'session' | 'render' | 'speak' | 'meta' | 'final' | 'error' | 'heartbeat' | 'done';
  render?: { title?: string; markdown?: string; code?: string; language?: string; runtime_hints?: any; timeline?: any[] };
  speak?: { text: string; audio_url?: string; duration_seconds?: number; voice?: string; model?: string };
  // Backward/forward compatible: some events may include segments inside speak
  // We'll detect at runtime
  message?: string;
  // Session context forwarded by the backend teacher agent
  session_id?: string;
};

type Props = {
  events: TeacherEvent[];
  onRetry?: () => void;
};

const TeacherPlayer: React.FC<Props> = ({ events, onRetry }) => {
  const lastRenderEvent = useMemo(() => {
    return [...events].reverse().find(e => e.type === 'render' && e.render?.code);
  }, [events]);

  const lastRender = lastRenderEvent?.render;

  const lastSpeak = useMemo(() => {
    const s = [...events].reverse().find(e => e.type === 'speak' && (e.speak?.audio_url || e.speak?.text));
    return s?.speak;
  }, [events]);

  // Very minimal audio player (web-only for now)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [visualsReady, setVisualsReady] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [ended, setEnded] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const resolveAudioUrl = (url?: string) => {
    if (!url) return undefined;
    if (/^https?:/i.test(url)) return url;
    // Stream comes from the slide orchestrator (port 8003)
    const base = getServiceUrl(8003);
    return `${base}${url}`;
  };
  const speakSegments = useMemo(() => {
    const latestSpeak = [...events].reverse().find(e => e.type === 'speak') as any;
    return latestSpeak?.speak?.segments as any[] | undefined;
  }, [events]);

  useEffect(() => {
    // No segmented playback; use single audio track if present
    const anySegments: any[] | undefined = undefined;
    if (Platform.OS === 'web' && audioRef.current) {
      try {
        audioRef.current.autoplay = true;
        audioRef.current.controls = false;
        (audioRef.current as any).playsInline = true;
        audioRef.current.muted = false;
        audioRef.current.volume = 1.0;
        audioRef.current.onended = () => { setTimeSeconds(0); setIsPlayingAudio(false); setEnded(true); };
        audioRef.current.ontimeupdate = () => setTimeSeconds(audioRef.current?.currentTime || 0);
        audioRef.current.onplay = () => { setIsPlayingAudio(true); setNeedsUserGesture(false); setEnded(false); };
        audioRef.current.onloadeddata = () => setAudioReady(true);
        audioRef.current.onpause = () => { setIsPlayingAudio(false); };
        // Pause during auto-fix
        if ((window as any).__teacherFixing) {
          setIsFixing(true);
          audioRef.current.pause();
          return;
        } else {
          setIsFixing(false);
        }

        // segmented mode (play only when visuals are ready and not fixing)
        if (lastSpeak?.audio_url && visualsReady && !isFixing) {
          audioRef.current.src = resolveAudioUrl(lastSpeak.audio_url)!;
          // Prime buffer
          audioRef.current.load();
          audioRef.current.currentTime = 0.001;
          const p = audioRef.current.play();
          if (p && typeof p.then === 'function') p.catch(() => { setNeedsUserGesture(true); });
        }
      } catch {}
    }
  }, [lastSpeak?.audio_url, speakSegments, visualsReady, isFixing]);

  // Poll fixing flag (set by CodeSlideRuntime)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = setInterval(() => {
      try { setIsFixing(!!(window as any).__teacherFixing); } catch {}
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.container}>
      {lastRender?.code ? (
        <CodeSlideRuntime
          code={lastRender.code!}
          slide={{
            // Provide minimal session context so auto-fix can use prior generation memory
            sessionId: (lastRenderEvent as any)?.session_id,
            // Derive topic from title format "Lesson: <topic>"
            topic: lastRender?.title ? String(lastRender.title).replace(/^Lesson:\s*/i, '') : undefined,
            // Also forward title to help when topic is missing
            title: lastRender?.title,
          }}
          showCaptions={false}
          isPlaying={isPlayingAudio}
          timeSeconds={timeSeconds}
          timeline={lastRender.timeline}
          onReadyChange={setVisualsReady}
          onRetry={onRetry}
        />
      ) : (
        <View style={styles.placeholder}> 
          <Text style={styles.placeholderText}>Waiting for teacher content…</Text>
        </View>
      )}

      {Platform.OS === 'web' ? <audio ref={audioRef as any} style={{ display: 'none' }} preload="auto" crossOrigin="anonymous" /> : null}

      {Platform.OS === 'web' && needsUserGesture ? (
        <View style={styles.overlay}> 
          <TouchableOpacity onPress={() => {
            try {
              if (audioRef.current) {
                const url = (speakSegments && speakSegments.length ? resolveAudioUrl(speakSegments[0]?.audio_url) : resolveAudioUrl(lastSpeak?.audio_url));
                if (url) {
                  (audioRef.current as any).playsInline = true;
                  audioRef.current.muted = false;
                  audioRef.current.volume = 1.0;
                  audioRef.current.src = url;
                  audioRef.current.currentTime = 0;
                  // Ensure load before play on Safari
                  audioRef.current.load();
                  audioRef.current.play().catch(() => setNeedsUserGesture(true));
                }
              }
            } catch {}
          }} style={styles.playButton}>
            <Text style={styles.playButtonText}>Start lesson</Text>
          </TouchableOpacity>
          {lastSpeak?.audio_url ? (
            <Text style={{ color: '#fff', marginTop: 8, opacity: 0.85 }} onPress={() => { const url = resolveAudioUrl(lastSpeak.audio_url); if (url && typeof window !== 'undefined') { (window as any).open(url, '_blank'); } }}>
              Open audio
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Starting spinner while visuals are ready but audio not yet available/playing */}
      {Platform.OS === 'web' && isFixing ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" />
          <Text style={[styles.playButtonText, { marginTop: 8 }]}>Repairing visuals…</Text>
        </View>
      ) : null}

      {Platform.OS === 'web' && !isFixing && visualsReady && !isPlayingAudio && !needsUserGesture && !audioReady ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" />
          <Text style={[styles.playButtonText, { marginTop: 8 }]}>Starting lesson…</Text>
        </View>
      ) : null}

      {/* Replay overlay when lesson audio has ended */}
      {Platform.OS === 'web' && ended ? (
        <View style={styles.overlay}>
          <TouchableOpacity onPress={() => {
            try {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => setNeedsUserGesture(true));
              }
            } catch {}
          }} style={styles.playButton}>
            <Text style={styles.playButtonText}>Replay lesson</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!lastSpeak?.audio_url && lastSpeak?.text ? (
        <View style={styles.caption}>
          <Text style={styles.captionText}>{lastSpeak.text}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  placeholder: { padding: 16, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#888' },
  caption: { padding: 10, marginTop: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 },
  captionText: { color: '#333' },
  playButton: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#1f6feb', borderRadius: 6 },
  playButtonText: { color: '#fff', fontWeight: '600' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
});

export default TeacherPlayer;


