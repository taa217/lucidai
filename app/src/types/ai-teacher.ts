// AI Teacher types for interactive learning sessions

export type TeacherEventType = "render" | "speak" | "meta" | "final" | "error" | "heartbeat" | "session" | "start" | "done";

export interface RenderPayload {
  title?: string;
  markdown?: string;
  code?: string;
  language?: string;
  runtime_hints?: Record<string, any>;
  timeline?: Array<{ at: number; event: string }>;
}

export interface SpeakSegment {
  text: string;
  audio_url?: string;
  start_at: number;
  duration_seconds?: number;
}

export interface SpeakPayload {
  text: string;
  audio_url?: string;
  duration_seconds?: number;
  voice?: string;
  model?: string;
  start_at?: number;
  segments?: SpeakSegment[];
  word_timestamps?: Array<{ word: string; start: number; end: number }>;
}

export interface MetaPayload {
  data: Record<string, any>;
}

export interface TeacherEvent {
  type: TeacherEventType;
  session_id?: string;
  seq?: number;
  render?: RenderPayload;
  speak?: SpeakPayload;
  meta?: MetaPayload;
  message?: string;
}

export interface StartSessionRequest {
  topic: string;
  user_id?: string;
  session_id?: string;
  preferred_voice?: string;
  language?: string;
}

export interface StreamLessonRequest {
  topic: string;
  user_id?: string;
  session_id?: string;
  tts?: boolean;
  preferred_voice?: string;
  language?: string;
  model?: string;
}

export interface TeacherSession {
  sessionId: string;
  topic: string;
  userId?: string;
  status: 'starting' | 'active' | 'completed' | 'error';
  currentEvent?: TeacherEvent;
  renderCode?: string;
  audioUrl?: string;
  isPlaying: boolean;
  timeSeconds: number;
  timeline?: Array<{ at: number; event: string }>;
}

export interface RenderErrorReport {
  sessionId: string;
  userId?: string;
  topic?: string;
  code: string;
  error: string;
  timeline?: Array<{ at: number; event: string }>;
  platform?: string;
}
