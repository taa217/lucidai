// Slide and Deck types for the slides system

export interface Slide {
  id: string;
  title: string;
  content: string;
  slide_type: 'content' | 'quiz' | 'practice' | 'summary';
  visual_elements?: {
    images?: string[];
    diagrams?: string[];
    charts?: string[];
  };
  voice_narration?: {
    audio_url?: string;
    text: string;
    duration_seconds: number;
  };
  metadata?: {
    difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
    estimated_duration_minutes?: number;
    learning_objectives?: string[];
    prerequisites?: string[];
  };
  order: number;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  learning_goal: string;
  slides: Slide[];
  metadata: {
    total_duration_minutes: number;
    difficulty_level: 'beginner' | 'intermediate' | 'advanced';
    created_at: string;
    updated_at: string;
    user_id: string;
    visual_style?: string;
    include_practice: boolean;
  };
  status: 'generating' | 'completed' | 'failed';
}

export interface SlideGenerationResponse {
  status: 'success' | 'failed';
  deck: Deck;
  generation_time_seconds: number;
  warnings?: string[];
  error?: string;
}

export interface SlideInteraction {
  deck_id: string;
  slide_id: string;
  interaction_type: 'click' | 'swipe' | 'answer' | 'voice_command';
  interaction_data?: any;
  timestamp: string;
  user_id: string;
}

export interface VoiceGenerationRequest {
  deck_id: string;
  slide_ids?: string[];
  voice_settings?: {
    voice_id?: string;
    speed?: number;
    pitch?: number;
  };
}

export interface VoiceGenerationResponse {
  status: 'started' | 'completed' | 'failed';
  task_id?: string;
  audio_urls?: Record<string, string>;
  error?: string;
}
