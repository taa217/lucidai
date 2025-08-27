import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentRequestDto,
  AgentResponseDto,
  HealthCheckDto,
  CurriculumRequestDto,
  CurriculumResponseDto,
  WhiteboardContentRequestDto,
  WhiteboardContentResponseDto,
} from '../dto/agent.dto';

@Injectable()
export class AIAgentClientService {
  private readonly logger = new Logger(AIAgentClientService.name);
  private readonly qnaServiceUrl: string;
  private readonly teachingContentServiceUrl: string;
  private readonly multiAgentOrchestratorUrl: string;
  private readonly slideOrchestratorUrl: string;
  private readonly aiTeacherUrl: string;
  private readonly voiceSynthesisServiceUrl: string;
  private readonly qnaServiceUrlResearch: string;
  private readonly requestTimeout: number;

  constructor(private configService: ConfigService) {
    this.qnaServiceUrl = this.configService.get<string>('QNA_SERVICE_URL', 'http://localhost:8001');
    this.qnaServiceUrlResearch = this.configService.get<string>('QNA_SERVICE_URL', 'http://localhost:8001');
    this.teachingContentServiceUrl = this.configService.get<string>('TEACHING_CONTENT_SERVICE_URL', 'http://localhost:8004');
    this.multiAgentOrchestratorUrl = this.configService.get<string>('MULTI_AGENT_ORCHESTRATOR_URL', 'http://localhost:8003');
    this.voiceSynthesisServiceUrl = this.configService.get<string>('VOICE_SYNTHESIS_SERVICE_URL', 'http://localhost:8005');
    this.slideOrchestratorUrl = this.configService.get<string>('SLIDE_ORCHESTRATOR_URL', 'http://localhost:8000');
    this.aiTeacherUrl = this.configService.get<string>('AI_TEACHER_URL', 'http://localhost:8003');
    // Increase default timeout to 120s to accommodate slower Q&A responses (e.g., provider latency)
    this.requestTimeout = this.configService.get<number>('REQUEST_TIMEOUT', 120000);
  }

  /**
   * Ask a question to the Q&A agent
   */
  async askQuestion(request: AgentRequestDto): Promise<AgentResponseDto> {
    try {
      this.logger.log(`Sending question to Q&A agent: ${request.message.substring(0, 100)}...`);

      const response = await this.fetchWithTimeout(`${this.qnaServiceUrl}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: request.sessionId,
          user_id: request.userId,
          message: request.message,
          conversation_history: request.conversationHistory || [],
          preferred_provider: request.preferredProvider,
          context: request.context,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Q&A service error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      return {
        sessionId: data.session_id,
        response: data.response,
        confidence: data.confidence,
        providerUsed: data.provider_used,
        processingTimeMs: data.processing_time_ms,
        metadata: data.metadata,
      };
    } catch (error) {
      this.logger.error(`Failed to communicate with Q&A agent: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Q&A Agent Communication Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Stream Q&A from Python service (/ask/stream)
   */
  async streamQnA(
    params: {
      sessionId: string;
      userId: string;
      message: string;
      conversationHistory?: any[];
      preferredProvider?: string;
      context?: any;
    },
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const url = `${this.qnaServiceUrl}/ask/stream`;
    const controller = new AbortController();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: JSON.stringify({
          session_id: params.sessionId,
          user_id: params.userId,
          message: params.message,
          conversation_history: params.conversationHistory || [],
          preferred_provider: params.preferredProvider,
          context: params.context,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(`Q&A stream error (${response.status}): ${text}`);
      }

      const reader = (response.body as any).getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) onChunk(decoder.decode(value, { stream: true }));
        }
      } else {
        const text = await response.text();
        onChunk(text);
      }
    } catch (error) {
      this.logger.error(`streamQnA failed: ${(error as Error).message}`);
      throw new HttpException(
        { error: 'Q&A Stream Failed', detail: (error as Error).message, timestamp: new Date().toISOString() },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      controller.abort();
    }
  }

  /**
   * Ingest a focused document into the QnA service's vector DB
   */
  async ingestDocument(params: {
    userId: string;
    docId: string;
    documentUrl?: string;
    documentTitle?: string;
    backgroundIndex?: boolean;
    skipVdbIfOpenai?: boolean;
  }): Promise<any> {
    try {
      this.logger.log(`Ingesting document ${params.docId} for user ${params.userId}`);

      // Ingestion may involve downloading the PDF and uploading to OpenAI.
      // Use a longer per-call timeout than the default request timeout.
      const url = `${this.qnaServiceUrl}/ingest`;
      const controller = new AbortController();
      const INGEST_TIMEOUT_MS = Math.max(this.requestTimeout, 180000); // at least 180s
      const timeoutId = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: params.userId,
          doc_id: params.docId,
          document_url: params.documentUrl,
          document_title: params.documentTitle,
          background_index: params.backgroundIndex ?? true,
          skip_vdb_if_openai: params.skipVdbIfOpenai ?? true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Q&A ingest error (${response.status}): ${text}`);
      }

      return await response.json();
    } catch (error) {
      // Ensure any pending timer is cleared if an error occurs after fetch started
      // (If controller/timeoutId were defined above, they will be GC'd; keeping catch simple.)
      this.logger.error(`Failed to ingest document: ${(error as Error).message}`);
      throw new HttpException(
        { error: 'Q&A Ingest Failed', detail: (error as Error).message, timestamp: new Date().toISOString() },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Stream research from Perplexity via QnA service proxy
   */
  async streamResearch(
    params: {
      sessionId: string;
      userId: string;
      query: string;
      conversationHistory?: any[];
    },
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const url = `${this.qnaServiceUrlResearch}/research/stream`;
    const controller = new AbortController();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: params.sessionId,
          user_id: params.userId,
          query: params.query,
          conversation_history: params.conversationHistory || [],
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(`Research stream error (${response.status}): ${text}`);
      }

      const reader = (response.body as any).getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        // Emit a lightweight session hint so the frontend can capture the server-assigned session id
        try { onChunk(`{"type":"session","sessionId":"${params.sessionId}"}\n`); } catch {}
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) onChunk(decoder.decode(value, { stream: true }));
        }
      } else {
        // Node 18 fetch body is a web stream; fallback by consuming as text
        const text = await response.text();
        try { onChunk(`{"type":"session","sessionId":"${params.sessionId}"}\n`); } catch {}
        onChunk(text);
      }
    } catch (error) {
      this.logger.error(`streamResearch failed: ${(error as Error).message}`);
      throw new HttpException(
        { error: 'Research Stream Failed', detail: (error as Error).message, timestamp: new Date().toISOString() },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      controller.abort();
    }
  }

  /**
   * Stream slides from Python orchestrator (NDJSON)
   */
  async streamSlides(
    params: { sessionId: string; userId: string; learningGoal: string },
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const url = `${this.slideOrchestratorUrl}/slides/stream`;
    const controller = new AbortController();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' },
        body: JSON.stringify({
          user_query: params.learningGoal,
          learning_goal: params.learningGoal,
          user_id: params.userId,
          session_id: params.sessionId,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(`Slides stream error (${response.status}): ${text}`);
      }

      const reader = (response.body as any).getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) onChunk(decoder.decode(value, { stream: true }));
        }
      } else {
        const text = await response.text();
        onChunk(text);
      }
    } catch (error) {
      this.logger.error(`streamSlides failed: ${(error as Error).message}`);
      throw new HttpException(
        { error: 'Slides Stream Failed', detail: (error as Error).message, timestamp: new Date().toISOString() },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    } finally {
      controller.abort();
    }
  }

  /**
   * Forward a render error to the AI teacher service to attempt an automatic fix.
   */
  async requestTeacherFix(payload: {
    sessionId?: string;
    userId?: string;
    topic?: string;
    code: string;
    error: string;
    timeline?: any[];
    platform?: string;
  }): Promise<{ fixed_code?: string; message?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.aiTeacherUrl}/teacher/render-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: payload.sessionId,
          user_id: payload.userId,
          topic: payload.topic,
          code: payload.code,
          error: payload.error,
          timeline: payload.timeline,
          platform: payload.platform,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI teacher fix error (${response.status}): ${text}`);
      }
      const data = await response.json();
      return { fixed_code: data?.fixed_code || data?.fixedCode, message: data?.message };
    } catch (error) {
      this.logger.error(`requestTeacherFix failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate a curriculum using the Teaching Content Service
   */
  async generateCurriculum(request: CurriculumRequestDto): Promise<CurriculumResponseDto> {
    try {
      this.logger.log(`Generating curriculum for user: ${request.userId} with goals: ${request.learningGoals.substring(0, 100)}...`);

      const response = await this.fetchWithTimeout(`${this.teachingContentServiceUrl}/curriculum/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: request.userId,
          learning_goals: request.learningGoals,
          uploaded_documents: request.uploadedDocuments || [],
          difficulty_level: request.difficultyLevel,
          learning_style: request.learningStyle,
          session_duration: request.sessionDuration,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Teaching Content Service error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      return {
        curriculumId: data.curriculum_id,
        userId: data.user_id,
        title: data.title,
        learningGoals: data.learning_goals,
        difficultyLevel: data.difficulty_level,
        totalDuration: data.total_duration,
        modules: data.modules.map((module: any) => ({
          id: module.id,
          title: module.title,
          duration: module.duration,
          status: module.status,
          content: module.content,
          activities: module.activities,
        })),
        documentSources: data.document_sources,
        createdAt: data.created_at,
      };
    } catch (error) {
      this.logger.error(`Failed to generate curriculum: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Curriculum Generation Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Generate whiteboard content for teaching
   */
  async generateWhiteboardContent(request: WhiteboardContentRequestDto): Promise<WhiteboardContentResponseDto> {
    try {
      this.logger.log(`Generating whiteboard content for curriculum: ${request.curriculumId}, module: ${request.moduleIndex}`);

      const response = await this.fetchWithTimeout(`${this.teachingContentServiceUrl}/whiteboard/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          curriculum_id: request.curriculumId,
          module_index: request.moduleIndex,
          user_id: request.userId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whiteboard content generation error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      return {
        sessionId: data.session_id,
        curriculumId: data.curriculum_id,
        moduleIndex: data.module_index,
        segments: data.segments.map((segment: any) => ({
          id: segment.id,
          voiceText: segment.voice_text,
          visualContent: segment.visual_content,
          coordinates: segment.coordinates,
          durationSeconds: segment.duration_seconds,
          visualAction: segment.visual_action,
        })),
        estimatedDuration: data.estimated_duration,
        learningObjectives: data.learning_objectives,
      };
    } catch (error) {
      this.logger.error(`Failed to generate whiteboard content: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Whiteboard Content Generation Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Synthesize voice from text
   */
  async synthesizeVoice(request: any): Promise<any> {
    try {
      this.logger.log(`Synthesizing voice for text: "${request.text.substring(0, 50)}..."`);
      
      // DEBUG: Log the full request being sent
      this.logger.log(`🔍 Voice synthesis request: ${JSON.stringify({
        ...request,
        text: request.text.substring(0, 50) + '...' // Truncate text for logging
      })}`);

      const response = await this.fetchWithTimeout(`${this.voiceSynthesisServiceUrl}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          voice: request.voice || 'neural',
          speed: request.speed || 1.0,
          pitch: request.pitch || 'medium',
          emotion: request.emotion || 'friendly',
          language: request.language || 'en-US',
          provider: request.provider, // Add provider
          model: request.model, // Add model
          voice_id: request.voice_id, // Add voice_id
          quality: request.quality // Add quality
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voice synthesis error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      return {
        audioId: data.audio_id,
        durationSeconds: data.duration_seconds,
        voiceUsed: data.voice_used,
        providerUsed: data.provider_used,
        modelUsed: data.model_used,
        cacheHit: data.cache_hit,
        timestamp: data.timestamp,
      };
    } catch (error) {
      this.logger.error(`Failed to synthesize voice: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Voice Synthesis Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Generate voice for teaching segments
   */
  async generateTeachingVoice(segments: any[]): Promise<any> {
    try {
      this.logger.log(`Generating voice for ${segments.length} teaching segments`);

      const response = await this.fetchWithTimeout(`${this.voiceSynthesisServiceUrl}/teaching/voice-segments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(segments),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Teaching voice generation error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      return {
        sessionId: data.session_id,
        voiceSegments: data.voice_segments?.map((segment: any) => ({
          segmentId: segment.segment_id,
          audioId: segment.audio_id,
          duration: segment.duration,
          providerUsed: segment.provider_used,
          modelUsed: segment.model_used,
          cacheHit: segment.cache_hit
        })) || [],
        totalDuration: data.total_duration,
        timestamp: data.timestamp,
      };
    } catch (error) {
      this.logger.error(`Failed to generate teaching voice: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Teaching Voice Generation Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Check the health of all AI services
   */
  async getServicesStatus(): Promise<{ 
    qnaAgent: HealthCheckDto;
    teachingContentService?: any;
    multiAgentOrchestrator?: any;
    voiceSynthesisService?: any;
  }> {
    try {
      const [qnaHealth, teachingHealth, orchestratorHealth, voiceHealth] = await Promise.allSettled([
        this.checkQnAAgentHealth(),
        this.checkTeachingContentServiceHealth(),
        this.checkMultiAgentOrchestratorHealth(),
        this.checkVoiceSynthesisServiceHealth(),
      ]);

      const result: any = {};

      if (qnaHealth.status === 'fulfilled') {
        result.qnaAgent = qnaHealth.value;
      } else {
        result.qnaAgent = { service: 'Q&A Agent', status: 'unhealthy', timestamp: new Date(), version: 'unknown' };
      }

      if (teachingHealth.status === 'fulfilled') {
        result.teachingContentService = teachingHealth.value;
      }

      if (orchestratorHealth.status === 'fulfilled') {
        result.multiAgentOrchestrator = orchestratorHealth.value;
      }

      if (voiceHealth.status === 'fulfilled') {
        result.voiceSynthesisService = voiceHealth.value;
      }

      return result;
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      throw new HttpException(
        {
          error: 'Health Check Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Check Q&A agent health specifically
   */
  async checkQnAAgentHealth(): Promise<HealthCheckDto> {
    try {
      this.logger.log('Checking Q&A agent health...');

      const response = await this.fetchWithTimeout(`${this.qnaServiceUrl}/health`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      const data = await response.json();

      return {
        service: data.service,
        status: data.status,
        timestamp: new Date(data.timestamp || Date.now()),
        version: data.version,
      };
    } catch (error) {
      this.logger.error(`Q&A agent health check failed: ${error.message}`);
      
      // Return an unhealthy status instead of throwing
      return {
        service: 'Q&A Agent Service',
        status: 'unhealthy',
        timestamp: new Date(),
        version: 'unknown',
      };
    }
  }

  /**
   * Check Teaching Content Service health
   */
  async checkTeachingContentServiceHealth(): Promise<any> {
    try {
      this.logger.log('Checking Teaching Content Service health...');

      const response = await this.fetchWithTimeout(`${this.teachingContentServiceUrl}/health`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Teaching Content Service health check failed with status ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error(`Teaching Content Service health check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check Multi-Agent Orchestrator health
   */
  async checkMultiAgentOrchestratorHealth(): Promise<any> {
    try {
      this.logger.log('Checking Multi-Agent Orchestrator health...');

      const response = await this.fetchWithTimeout(`${this.multiAgentOrchestratorUrl}/health`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Multi-Agent Orchestrator health check failed with status ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error(`Multi-Agent Orchestrator health check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check Voice Synthesis Service health
   */
  async checkVoiceSynthesisServiceHealth(): Promise<any> {
    try {
      this.logger.log('Checking Voice Synthesis Service health...');

      const response = await this.fetchWithTimeout(`${this.voiceSynthesisServiceUrl}/health`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Voice Synthesis Service health check failed with status ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error(`Voice Synthesis Service health check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get voice audio stream by ID (simplified - streaming handled in controller)
   */
  async getVoiceAudio(audioId: string): Promise<Response> {
    try {
      this.logger.log(`Retrieving audio response: ${audioId} from ${this.voiceSynthesisServiceUrl}/audio/${audioId}`);

      const response = await this.fetchWithTimeout(`${this.voiceSynthesisServiceUrl}/audio/${audioId}`, {
        method: 'GET',
      });

      this.logger.log(`Voice service responded with status: ${response.status} for audio: ${audioId}`);

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Voice service error for audio ${audioId}: ${response.status} - ${errorText}`);
        throw new Error(`Audio retrieval error (${response.status}): ${errorText}`);
      }

      this.logger.log(`Successfully retrieved audio response for: ${audioId}`);
      
      // Return the full response object for the controller to handle
      return response;
    } catch (error) {
      this.logger.error(`Failed to retrieve audio: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Audio Retrieval Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Get voice providers status
   */
  async getVoiceProvidersStatus(): Promise<any> {
    try {
      this.logger.log('Getting voice providers status...');

      const response = await this.fetchWithTimeout(`${this.voiceSynthesisServiceUrl}/providers/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voice providers status failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error(`Voice providers status failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available voices
   */
  async getAvailableVoices(): Promise<any> {
    try {
      this.logger.log('Getting available voices...');

      const response = await this.fetchWithTimeout(`${this.voiceSynthesisServiceUrl}/voices`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voice list failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error(`Voice list failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch with timeout support using native fetch
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.requestTimeout}ms`);
      }
      
      throw error;
    }
  }
} 