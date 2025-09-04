import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import TeacherPlayer from '../../components/teacher/TeacherPlayer';
import { apiService } from '../../services/api';

type TeacherEvent = {
  type: 'start' | 'session' | 'render' | 'speak' | 'meta' | 'final' | 'error' | 'heartbeat' | 'done';
  render?: { code?: string; language?: string; title?: string; markdown?: string; runtime_hints?: any };
  speak?: { text: string; audio_url?: string; duration_seconds?: number; voice?: string; model?: string };
  message?: string;
};

const TeacherScreen: React.FC = () => {
  const { topic, sessionId, userId } = useLocalSearchParams<{ topic?: string; sessionId?: string; userId?: string }>();
  const [events, setEvents] = useState<TeacherEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = String(topic || '').trim();
    if (!t) { setError('No topic provided'); setLoading(false); return; }

    (async () => {
      try {
        await apiService.streamTeacherLesson({ topic: t, sessionId: String(sessionId || ''), userId: String(userId || '') }, (chunk) => {
          if (cancelled) return;
          const lines = chunk.split('\n');
          for (const line of lines) {
            const s = line.trim();
            if (!s) continue;
            try {
              const ev = JSON.parse(s) as TeacherEvent;
              setEvents(prev => [...prev, ev]);
              if (ev.type === 'done' || ev.type === 'final') setLoading(false);
              if (ev.type === 'error') { setError(ev.message || 'Error'); setLoading(false); }
            } catch {}
          }
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [topic, sessionId, userId, reloadKey]);

  const handleRetry = () => {
    try {
      setEvents([]);
      setError(null);
      setLoading(true);
      setReloadKey(k => k + 1);
    } catch {}
  };

  return (
    <View style={styles.container}>
      {loading && events.length === 0 ? (
        <View style={styles.center}> 
          <ActivityIndicator />
          <Text style={styles.loadingText}>Starting lesson…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}> 
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <TeacherPlayer events={events} onRetry={handleRetry} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: '#555' },
  errorText: { color: '#c00' },
});

export default TeacherScreen;








