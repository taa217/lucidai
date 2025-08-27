import {
  Controller,
  Post,
  Get,
  Options,
  Body,
  ValidationPipe,
  UsePipes,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Res,
  Req,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { AIAgentClientService } from '../services/ai-agent-client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeepPartial } from 'typeorm';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { UserService } from '../services/user.service';
import { ResearchSession } from '../entities/research-session.entity';
import { ResearchMessage } from '../entities/research-message.entity';
import { ResearchSource } from '../entities/research-source.entity';
import {
  AgentRequestDto,
  AgentResponseDto,
  HealthCheckDto,
  ErrorResponseDto,
  CurriculumRequestDto,
  CurriculumResponseDto,
  WhiteboardContentRequestDto,
  WhiteboardContentResponseDto,
  VoiceSynthesisRequestDto,
  VoiceSynthesisResponseDto,
} from '../dto/agent.dto';

@ApiTags('AI Agents')
@Controller('api/agents')
@UsePipes(new ValidationPipe({ transform: true }))
export class AIAgentController {
  private readonly logger = new Logger(AIAgentController.name);

  constructor(
    private readonly aiAgentClient: AIAgentClientService,
    private readonly userService: UserService,
    @InjectRepository(ChatSession)
    private readonly chatSessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepo: Repository<ChatMessage>,
    @InjectRepository(ResearchSession)
    private readonly researchSessionRepo: Repository<ResearchSession>,
    @InjectRepository(ResearchMessage)
    private readonly researchMessageRepo: Repository<ResearchMessage>,
    @InjectRepository(ResearchSource)
    private readonly researchSourceRepo: Repository<ResearchSource>,
  ) {}

  @Post('qna/ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask a question to the Q&A agent',
    description: 'Submit a question to the AI Q&A agent and receive an intelligent response',
  })
  @ApiBody({
    type: AgentRequestDto,
    description: 'Question request with context and conversation history',
    examples: {
      basicQuestion: {
        summary: 'Basic Question',
        value: {
          sessionId: 'session_123',
          userId: 'user_456',
          message: 'What is the capital of France?',
          conversationHistory: [],
        },
      },
      mathQuestion: {
        summary: 'Math Question with Context',
        value: {
          sessionId: 'session_123',
          userId: 'user_456',
          message: 'Can you solve this quadratic equation: x² + 5x + 6 = 0?',
          conversationHistory: [
            {
              role: 'user',
              content: 'I need help with algebra',
              timestamp: '2024-01-01T10:00:00Z',
            },
            {
              role: 'assistant',
              content: 'I\'d be happy to help you with algebra! What specific problem are you working on?',
              timestamp: '2024-01-01T10:00:01Z',
            },
          ],
          context: {
            subject: 'mathematics',
            topic: 'quadratic equations',
            difficulty: 'intermediate',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully processed the question',
    type: AgentResponseDto,
    example: {
      sessionId: 'session_123',
      response: 'The capital of France is Paris. It is located in the north-central part of the country...',
      confidence: 0.95,
      providerUsed: 'openai',
      processingTimeMs: 1250,
      metadata: {
        tokensUsed: 150,
        model: 'gpt-5-2025-08-07',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'AI service unavailable',
    type: ErrorResponseDto,
  })
  async askQuestion(@Body() request: AgentRequestDto): Promise<AgentResponseDto> {
    this.logger.log(`Received Q&A request from user: ${request.userId}, session: ${request.sessionId}`);
    
    try {
      // Enrich context with user customization preferences (non-blocking best-effort)
      let enrichedContext = request.context || {};
      try {
        if (request.userId) {
          const customize = await this.userService.getCustomizePreferences(request.userId);
          enrichedContext = { ...enrichedContext, userPreferences: customize };
        }
      } catch (e) {
        this.logger.warn(`Could not load user customization for ${request.userId}: ${(e as any)?.message || e}`);
      }

      const response = await this.aiAgentClient.askQuestion({
        ...request,
        context: enrichedContext,
      });
      
      this.logger.log(
        `Q&A response generated for session: ${request.sessionId}, ` +
        `confidence: ${response.confidence}, provider: ${response.providerUsed}`,
      );
      
      return response;
    } catch (error) {
      this.logger.error(
        `Failed to process Q&A request for session: ${request.sessionId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Q&A streaming proxy - forwards to Python QnA /ask/stream and relays NDJSON
   */
  @Post('qna/ask/stream')
  @HttpCode(HttpStatus.OK)
  async streamQnA(@Body() body: any, @Res() res: any) {
    const { sessionId, userId, message, conversationHistory, preferredProvider, context } = body || {};
    if (!sessionId || !userId || !message) {
      throw new HttpException(
        { error: 'Bad Request', detail: 'sessionId, userId, and message are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Set streaming-friendly headers to avoid proxy buffering
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
      // Persist user message and ensure session
      const docId: string | null = context?.docId || context?.documentId || null;
      const isUuid = (value: string): boolean => {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      };

      let session: ChatSession | null = null;
      if (isUuid(sessionId)) {
        session = (await this.chatSessionRepo.findOne({ where: { id: sessionId } as any })) as ChatSession | null;
      } else if (docId) {
        // Resolve by (userId, docId) if alias/non-uuid provided
        session = await this.chatSessionRepo.findOne({ where: { userId, docId } as any, order: { updatedAt: 'DESC' } as any });
      }

      if (!session) {
        const newSessionPayload: DeepPartial<ChatSession> = {
          userId,
          docId: docId || null,
          title: (context?.documentTitle as string) || null,
          modelProvider: preferredProvider || null,
          messageCount: 0,
          lastMessageAt: null,
          lastMessagePreview: null,
        } as any;
        const newSession = this.chatSessionRepo.create(newSessionPayload);
        session = await this.chatSessionRepo.save(newSession);
      }
      const userMsg = this.chatMessageRepo.create({
        sessionId: session.id,
        userId,
        role: 'user',
        content: message,
        metadata: { docId: docId || undefined },
      });
      await this.chatMessageRepo.save(userMsg);
      await this.chatSessionRepo.update(session.id, {
        messageCount: () => '"messageCount" + 1',
        lastMessageAt: new Date(),
        lastMessagePreview: message.slice(0, 300),
        docId: session.docId || docId || null,
        modelProvider: preferredProvider || session.modelProvider || null,
      } as any);

      // If session has no title yet, set it to the first user question (trimmed)
      if (!session.title) {
        const firstLine = (message || '').split('\n')[0].trim();
        const baseTitle = firstLine.length > 0 ? firstLine : (context?.documentTitle as string) || 'Conversation';
        const clipped = baseTitle.length > 80 ? baseTitle.slice(0, 77) + '…' : baseTitle;
        try {
          await this.chatSessionRepo.update(session.id, { title: clipped } as any);
          session.title = clipped as any;
        } catch {}
      }

      // Best-effort enrichment of context with user customization preferences
      let enrichedContext = context || {};
      try {
        const customize = await this.userService.getCustomizePreferences(userId);
        enrichedContext = { ...enrichedContext, userPreferences: customize };
      } catch (e) {
        this.logger.warn(`Could not load user customization for ${userId}: ${(e as any)?.message || e}`);
      }

      await this.aiAgentClient.streamQnA(
        { sessionId, userId, message, conversationHistory, preferredProvider, context: enrichedContext },
        async (chunk: string) => {
          res.write(chunk);
          try { res.flush?.(); } catch {}
          try {
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              const evt = JSON.parse(line);
              if (evt.type === 'final' && typeof evt.content === 'string') {
                const aiMsg = this.chatMessageRepo.create({
                  sessionId: session!.id,
                  userId,
                  role: 'assistant',
                  content: evt.content,
                  metadata: { provider: evt.provider || preferredProvider, processingTimeMs: evt.processingTimeMs },
                });
                await this.chatMessageRepo.save(aiMsg);
                await this.chatSessionRepo.update(session!.id, {
                  messageCount: () => '"messageCount" + 1',
                  lastMessageAt: new Date(),
                  lastMessagePreview: evt.content.slice(0, 300),
                  modelProvider: evt.provider || preferredProvider || null,
                } as any);

                // If the session still lacks a title, try to derive one from AI content
                if (!session!.title) {
                  const firstLine = (evt.content || '').split('\n')[0].trim();
                  const clipped = firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine;
                  if (clipped) {
                    try {
                      await this.chatSessionRepo.update(session!.id, { title: clipped } as any);
                      session!.title = clipped as any;
                    } catch {}
                  }
                }
              }
            }
          } catch {}
        },
      );
    } catch (error) {
      this.logger.error('Q&A stream failed', (error as any)?.stack);
      if (!res.headersSent) {
        res.status(503).json({ error: 'Q&A Stream Failed', detail: (error as Error).message });
      }
    } finally {
      try { res.end(); } catch {}
    }
  }

  @Post('qna/ingest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ingest a focused document for Q&A',
    description: 'Uploads text chunks for the given document into the vector DB for better retrieval',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        docId: { type: 'string' },
        documentUrl: { type: 'string' },
        documentTitle: { type: 'string' },
      },
      required: ['userId', 'docId']
    }
  })
  async ingestDocument(@Body() body: any): Promise<any> {
    const { userId, docId, documentUrl, documentTitle } = body || {};
    if (!userId || !docId) {
      throw new HttpException(
        { error: 'Bad Request', detail: 'userId and docId are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.aiAgentClient.ingestDocument({ userId, docId, documentUrl, documentTitle });
  }

  @Post('teaching/curriculum/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate AI curriculum from learning goals',
    description: 'Create a personalized curriculum based on user learning goals and uploaded documents',
  })
  @ApiBody({
    type: CurriculumRequestDto,
    description: 'Curriculum generation request',
    examples: {
      calculus: {
        summary: 'Calculus Learning',
        value: {
          userId: 'user_123',
          learningGoals: 'Learn calculus fundamentals',
          uploadedDocuments: [],
          difficultyLevel: 'intermediate',
          learningStyle: 'balanced',
          sessionDuration: 45,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated curriculum',
    type: CurriculumResponseDto,
  })
  async generateCurriculum(@Body() request: CurriculumRequestDto): Promise<CurriculumResponseDto> {
    this.logger.log(`Generating curriculum for user: ${request.userId}`);
    
    try {
      const curriculum = await this.aiAgentClient.generateCurriculum(request);
      
      this.logger.log(`Curriculum generated: ${curriculum.curriculumId}`);
      
      return curriculum;
    } catch (error) {
      this.logger.error(`Curriculum generation failed for user: ${request.userId}`, error.stack);
      throw error;
    }
  }

  @Post('teaching/whiteboard/content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate whiteboard teaching content',
    description: 'Create voice + visual teaching content for immersive whiteboard experience',
  })
  @ApiBody({
    type: WhiteboardContentRequestDto,
    description: 'Whiteboard content generation request',
    examples: {
      module: {
        summary: 'Module Teaching Content',
        value: {
          curriculumId: 'curriculum_123',
          moduleIndex: 0,
          userId: 'user_123',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated whiteboard content',
    type: WhiteboardContentResponseDto,
  })
  async generateWhiteboardContent(@Body() request: WhiteboardContentRequestDto): Promise<WhiteboardContentResponseDto> {
    this.logger.log(`Generating whiteboard content for curriculum: ${request.curriculumId}, module: ${request.moduleIndex}`);
    
    try {
      const content = await this.aiAgentClient.generateWhiteboardContent(request);
      
      this.logger.log(`Whiteboard content generated: ${content.sessionId}`);
      
      return content;
    } catch (error) {
      this.logger.error(
        `Whiteboard content generation failed for curriculum: ${request.curriculumId}`,
        error.stack,
      );
      throw error;
    }
  }

  @Post('voice/synthesize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Synthesize voice from text',
    description: 'Convert teaching text to natural speech for immersive AI teaching experience',
  })
  @ApiBody({
    type: VoiceSynthesisRequestDto,
    description: 'Voice synthesis request',
    examples: {
      teaching: {
        summary: 'Teaching Voice',
        value: {
          text: 'Welcome to our calculus lesson. Today we will explore the fundamentals of derivatives.',
          voice: 'neural',
          speed: 1.0,
          emotion: 'friendly',
          language: 'en-US',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully synthesized voice',
    type: VoiceSynthesisResponseDto,
  })
  async synthesizeVoice(@Body() request: VoiceSynthesisRequestDto): Promise<VoiceSynthesisResponseDto> {
    this.logger.log(`Synthesizing voice for text: "${request.text.substring(0, 50)}..."`);
    
    try {
      const voiceResult = await this.aiAgentClient.synthesizeVoice(request);
      
      this.logger.log(`Voice synthesized: ${voiceResult.audioId}, duration: ${voiceResult.durationSeconds}s`);
      
      return voiceResult;
    } catch (error) {
      this.logger.error(`Voice synthesis failed for text: "${request.text.substring(0, 50)}"`, error.stack);
      throw error;
    }
  }

  @Get('voice/audio/:audioId')
  @ApiOperation({
    summary: 'Get synthesized audio file',
    description: 'Stream the synthesized audio file for a given audio ID',
  })
  @ApiParam({
    name: 'audioId',
    description: 'Audio identifier from voice synthesis',
    example: 'a1b2c3d4e5f6',
  })
  @ApiResponse({
    status: 200,
    description: 'Audio file stream',
    headers: {
      'Content-Type': { description: 'audio/wav' },
      'Content-Disposition': { description: 'attachment; filename=speech.wav' },
    },
  })
  async getAudioFile(@Param('audioId') audioId: string, @Req() req: any, @Res() res: any): Promise<void> {
    this.logger.log(`🎵 Audio request received: ${audioId}`);
    this.logger.log(`📋 Request method: ${req.method}`);
    this.logger.log(`🌐 Request headers: ${JSON.stringify(req.headers, null, 2)}`);
    this.logger.log(`📡 User-Agent: ${req.headers['user-agent']}`);
    
    // Enhanced debugging for expo-av requests
    const isExpoAv = req.headers['user-agent']?.includes('ExpoAV') || 
                    req.headers['user-agent']?.includes('CFNetwork') ||
                    req.headers['user-agent']?.includes('Darwin');
    const isOkHttp = req.headers['user-agent']?.includes('okhttp');
    
    this.logger.log(`🎯 Request source: ${isExpoAv ? 'expo-av' : isOkHttp ? 'okhttp (fetch)' : 'unknown'}`);
    
    try {
      // Get the raw response (not just the body)
      this.logger.log(`🔗 Requesting from voice service: ${audioId}`);
      
      const response = await this.aiAgentClient.getVoiceAudio(audioId);
      
      this.logger.log(`📊 Voice service response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        this.logger.error(`❌ Voice service error for audio ${audioId}: ${response.status}`);
        return res.status(404).json({ 
          error: 'Audio file not found', 
          audioId,
          details: `Voice service returned ${response.status}` 
        });
      }
      
      if (!response.body) {
        this.logger.error(`❌ No response body for audio: ${audioId}`);
        return res.status(404).json({ error: 'Audio stream not available', audioId });
      }
      
      // Get content length if available
      const contentLength = response.headers.get('content-length');
      this.logger.log(`📏 Content length: ${contentLength || 'unknown'}`);
      
      // Get content type from voice service response
      const contentType = response.headers.get('content-type') || 'audio/mpeg';
      this.logger.log(`🎵 Content type: ${contentType}`);
      
      // Set expo-av compatible headers
      res.set({
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Range, Content-Length',
      });
      
      // Add content length if available
      if (contentLength) {
        res.set('Content-Length', contentLength);
      }
      
      // Read the entire response into a buffer for expo-av compatibility
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      this.logger.log(`✅ Audio file served successfully: ${audioId} (${buffer.length} bytes)`);
      
      // Send the complete audio file as a buffer (expo-av compatible)
      res.send(buffer);
      
    } catch (error) {
      this.logger.error(`❌ Failed to serve audio file: ${audioId}`, error.stack);
      
      if (!res.headersSent) {
        res.status(404).json({ 
          error: 'Audio file not found', 
          audioId,
          details: error.message 
        });
      }
    }
  }

  @Options('voice/audio/:audioId')
  async handleAudioOptions(@Param('audioId') audioId: string, @Res() res: any): Promise<void> {
    this.logger.log(`🔧 OPTIONS request for audio: ${audioId}`);
    
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range, Content-Length, Content-Type',
      'Access-Control-Max-Age': '3600',
    });
    
    res.sendStatus(200);
  }

  @Post('voice/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test voice synthesis end-to-end',
    description: 'Test voice synthesis and audio serving to debug issues',
  })
  async testVoiceSynthesis(): Promise<any> {
    this.logger.log('Testing voice synthesis end-to-end...');
    
    try {
      // Step 1: Test voice synthesis
      const synthesisRequest = {
        text: 'This is a voice synthesis test. Hello from AI teacher!',
        voice: 'neural',
        speed: 1.0,
        emotion: 'friendly',
        language: 'en-US',
      };
      
      this.logger.log('Step 1: Testing voice synthesis...');
      const voiceResult = await this.aiAgentClient.synthesizeVoice(synthesisRequest);
      this.logger.log(`Voice synthesis successful: ${voiceResult.audioId}`);
      
      // Step 2: Test audio retrieval
      this.logger.log('Step 2: Testing audio retrieval...');
      const audioStream = await this.aiAgentClient.getVoiceAudio(voiceResult.audioId);
      
      if (audioStream) {
        this.logger.log('Audio retrieval successful');
      }
      
      return {
        status: 'success',
        message: 'Voice synthesis test completed successfully',
        audioId: voiceResult.audioId,
        audioUrl: `${process.env.BASE_URL || 'http://localhost:3001'}/api/agents/voice/audio/${voiceResult.audioId}`,
        synthesis: voiceResult,
        audioStreamAvailable: !!audioStream,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Voice synthesis test failed', error.stack);
      return {
        status: 'error',
        message: 'Voice synthesis test failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('voice/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check voice synthesis service health',
    description: 'Get the health status of the voice synthesis service',
  })
  @ApiResponse({
    status: 200,
    description: 'Voice service health status',
  })
  async getVoiceHealth(): Promise<any> {
    this.logger.log('Checking voice synthesis service health...');
    
    try {
      const voiceHealth = await this.aiAgentClient.checkVoiceSynthesisServiceHealth();
      
      this.logger.log(`Voice service health check completed: ${voiceHealth.status}`);
      
      return voiceHealth;
    } catch (error) {
      this.logger.error('Voice service health check failed', error.stack);
      return {
        status: 'unhealthy',
        service: 'voice_synthesis_service',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('teaching/voice-segments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate voice for teaching segments',
    description: 'Create voice narration for multiple whiteboard teaching segments',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated voice segments',
  })
  async generateTeachingVoice(@Body() segments: any[]): Promise<any> {
    this.logger.log(`Generating voice for ${segments.length} teaching segments`);
    
    try {
      const voiceSegments = await this.aiAgentClient.generateTeachingVoice(segments);
      
      this.logger.log(`Voice segments generated: ${voiceSegments.sessionId}`);
      
      return voiceSegments;
    } catch (error) {
      this.logger.error(`Teaching voice generation failed for ${segments.length} segments`, error.stack);
      throw error;
    }
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check AI services health',
    description: 'Get the health status of all AI agent services',
  })
  @ApiResponse({
    status: 200,
    description: 'Health check results',
    schema: {
      type: 'object',
      properties: {
        qnaAgent: {
          type: 'object',
          properties: {
            service: { type: 'string', example: 'QnA Agent Service' },
            status: { type: 'string', example: 'healthy' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string', example: '0.1.0' },
          },
        },
        teachingContentService: {
          type: 'object',
          properties: {
            service: { type: 'string', example: 'Teaching Content Service' },
            status: { type: 'string', example: 'healthy' },
            generatedCurricula: { type: 'number', example: 5 },
            activeSessions: { type: 'number', example: 2 },
          },
        },
        multiAgentOrchestrator: {
          type: 'object',
          properties: {
            service: { type: 'string', example: 'Multi-Agent Orchestrator' },
            status: { type: 'string', example: 'healthy' },
            activeAgents: { type: 'number', example: 4 },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'One or more AI services are unavailable',
    type: ErrorResponseDto,
  })
  async getHealth(): Promise<{ 
    qnaAgent: HealthCheckDto;
    teachingContentService?: any; 
    multiAgentOrchestrator?: any;
  }> {
    this.logger.log('Checking AI services health');
    
    try {
      const healthStatus = await this.aiAgentClient.getServicesStatus();
      
      this.logger.log(`AI services health check completed`);
      
      return healthStatus;
    } catch (error) {
      this.logger.error('Health check failed', error.stack);
      throw error;
    }
  }

  @Get('qna/health')
  @ApiOperation({
    summary: 'Check Q&A agent health',
    description: 'Get the health status of the Q&A agent service specifically',
  })
  @ApiResponse({
    status: 200,
    description: 'Q&A agent health status',
    type: HealthCheckDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Q&A agent service unavailable',
    type: ErrorResponseDto,
  })
  async getQnAHealth(): Promise<HealthCheckDto> {
    this.logger.log('Checking Q&A agent health');
    
    try {
      const health = await this.aiAgentClient.checkQnAAgentHealth();
      
      this.logger.log(`Q&A agent health check completed: ${health.status}`);
      
      return health;
    } catch (error) {
      this.logger.error('Q&A agent health check failed', error.stack);
      throw error;
    }
  }

  /**
   * 📊 Get voice providers status
   * Forwards the request to the voice synthesis service
   */
  @Get('voice/providers/status')
  async getProvidersStatus(): Promise<any> {
    try {
      this.logger.log('📊 Fetching voice providers status...');
      
      const providersData = await this.aiAgentClient.getVoiceProvidersStatus();
      this.logger.log(`✅ Providers status fetched: ElevenLabs=${providersData.elevenlabs?.configured}, providers=${providersData.provider_priority?.join(', ')}`);
      
      return providersData;
    } catch (error) {
      this.logger.error(`❌ Failed to fetch providers status: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Voice Providers Status Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 📋 Get available voices
   * Forwards the request to the voice synthesis service
   */
  @Get('voice/voices')
  async getAvailableVoices(): Promise<any> {
    try {
      this.logger.log('📋 Fetching available voices...');
      
      const voicesData = await this.aiAgentClient.getAvailableVoices();
      this.logger.log(`✅ Voices fetched: ${Object.keys(voicesData.providers || {}).length} providers`);
      
      return voicesData;
    } catch (error) {
      this.logger.error(`❌ Failed to fetch voices: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'Voice List Failed',
          detail: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('services/status')
  @ApiOperation({
    summary: 'Check AI services health',
    description: 'Get the health status of all AI agent services',
  })
  @ApiResponse({
    status: 200,
    description: 'Health check results',
    schema: {
      type: 'object',
      properties: {
        qnaAgent: {
          type: 'object',
          properties: {
            service: { type: 'string', example: 'QnA Agent Service' },
            status: { type: 'string', example: 'healthy' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string', example: '0.1.0' },
          },
        },
        teachingContentService: {
          type: 'object',
          properties: {
            service: { type: 'string', example: 'Teaching Content Service' },
            status: { type: 'string', example: 'healthy' },
            generatedCurricula: { type: 'number', example: 5 },
            activeSessions: { type: 'number', example: 2 },
          },
        },
        multiAgentOrchestrator: {
          type: 'object',
          properties: {
            service: { type: 'string', example: 'Multi-Agent Orchestrator' },
            status: { type: 'string', example: 'healthy' },
            activeAgents: { type: 'number', example: 4 },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'One or more AI services are unavailable',
    type: ErrorResponseDto,
  })
  async getServicesStatus(): Promise<{ 
    qnaAgent: HealthCheckDto;
    teachingContentService?: any; 
    multiAgentOrchestrator?: any;
  }> {
    this.logger.log('Checking AI services health');
    
    try {
      const healthStatus = await this.aiAgentClient.getServicesStatus();
      
      this.logger.log(`AI services health check completed`);
      
      return healthStatus;
    } catch (error) {
      this.logger.error('Health check failed', error.stack);
      throw error;
    }
  }

  /**
   * Research streaming endpoint (proxied via QnA service to Perplexity)
   */
  @Post('research/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stream deep research results',
    description: 'Streams newline-delimited JSON chunks: {type: content|citations|raw|error|done, ...}',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        userId: { type: 'string' },
        query: { type: 'string' },
        conversationHistory: { type: 'array' },
      },
      required: ['sessionId', 'userId', 'query']
    }
  })
  async streamResearch(@Body() body: any, @Res() res: any) {
    const { sessionId, userId, query, conversationHistory } = body || {};
    if (!sessionId || !userId || !query) {
      throw new HttpException(
        { error: 'Bad Request', detail: 'sessionId, userId, and query are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders?.();

    try {
      // Ensure a session exists and persist the user message
      const isUuid = (value: string): boolean => {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      };

      let session: ResearchSession | null = null;
      if (isUuid(sessionId)) {
        session = (await this.researchSessionRepo.findOne({ where: { id: sessionId } as any })) as ResearchSession | null;
      }
      if (!session) {
        // Create a dedicated research session if none provided/found
        const firstLine = (query || '').split('\n')[0].trim();
        const clipped = firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine;
        const newSessionPayload: DeepPartial<ResearchSession> = {
          userId,
          title: clipped ? `Research: ${clipped}` : 'Research',
          messageCount: 0,
          lastMessageAt: null,
        } as any;
        session = await this.researchSessionRepo.save(this.researchSessionRepo.create(newSessionPayload));
      }

      // Store the user message
      const userMsg = this.researchMessageRepo.create({
        sessionId: session!.id,
        userId,
        role: 'user',
        content: query,
        metadata: { research: true },
      });
      await this.researchMessageRepo.save(userMsg);
      await this.researchSessionRepo.update(session!.id, {
        messageCount: () => '"messageCount" + 1',
        lastMessageAt: new Date(),
      } as any);

      // Helpers to handle finalization
      const stripThinkBlocks = (raw: string): string => {
        if (!raw) return '';
        let visible = raw.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '');
        const lower = visible.toLowerCase();
        const lastOpen = lower.lastIndexOf('<think');
        const lastClose = lower.lastIndexOf('</think>');
        if (lastOpen !== -1 && lastOpen > lastClose) {
          visible = visible.slice(0, lastOpen);
        }
        return visible;
      };
      const extractThinkBlocks = (raw: string): string => {
        if (!raw) return '';
        const closedMatches = Array.from(raw.matchAll(/<think[^>]*>([\s\S]*?)<\/think>/gi));
        let thoughts = closedMatches.map(m => m[1]).join('').trim();
        const lastOpen = raw.toLowerCase().lastIndexOf('<think');
        const lastClose = raw.toLowerCase().lastIndexOf('</think>');
        if (lastOpen !== -1 && lastOpen > lastClose) {
          const afterOpen = raw.slice(lastOpen);
          const contentStart = afterOpen.indexOf('>');
          if (contentStart !== -1) {
            const trailing = afterOpen.slice(contentStart + 1);
            thoughts = (thoughts + (thoughts ? '\n' : '') + trailing).trim();
          }
        }
        return thoughts;
      };

      let assembledAssistant = '';
      let assembledSources: Array<{ url?: string; title?: string; domain?: string; score?: number }> = [];
      const sourceKeySet = new Set<string>();
      const makeSourceKey = (s: { url?: string; title?: string; domain?: string }): string => {
        if (s.url) return `url:${s.url.trim().toLowerCase()}`;
        const t = (s.title || '').trim().toLowerCase();
        const d = (s.domain || '').trim().toLowerCase();
        return `td:${t}|${d}`;
      };
      const addSourceIfNew = (src: { url?: string; title?: string; domain?: string; score?: number }) => {
        const key = makeSourceKey(src);
        if (!key) return;
        if (!sourceKeySet.has(key)) {
          sourceKeySet.add(key);
          assembledSources.push(src);
        }
      };
      let savedAssistant = false;

      // Stream from QnA service and persist assistant message at final or end-of-stream
      await this.aiAgentClient.streamResearch(
        { sessionId: session!.id, userId, query, conversationHistory },
        async (chunk) => {
          res.write(chunk);
          try {
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              const evt = JSON.parse(line);
              if (evt.type === 'content' && typeof evt.delta === 'string') {
                assembledAssistant += evt.delta;
              }
              if (evt.type === 'citations' && Array.isArray(evt.results)) {
                for (const item of evt.results) {
                  const url: string | undefined = item?.url || item?.link || item?.source_url || undefined;
                  const title: string | undefined = item?.title || item?.name || item?.source || undefined;
                  const score: number | undefined = item?.score || item?.relevance;
                  let domain: string | undefined = undefined;
                  try { if (url) { const u = new URL(url); domain = u.hostname.replace(/^www\./, ''); } } catch {}
                  if (url || title || domain) {
                    addSourceIfNew({ url, title, domain, score });
                  }
                }
              }
              if (evt.type === 'final' && typeof evt.content === 'string') {
                const visible = stripThinkBlocks(evt.content || '');
                const thoughts = extractThinkBlocks(evt.content || '');
                const aiMsg = this.researchMessageRepo.create({
                  sessionId: session!.id,
                  userId,
                  role: 'assistant',
                  content: visible,
                  metadata: { provider: 'perplexity' },
                  thoughts: thoughts || null,
                });
                const saved = await this.researchMessageRepo.save(aiMsg);
                // Persist deduped top citations for the assistant message
                if (assembledSources.length) {
                  const MAX_SOURCES = 8;
                  const unique = assembledSources.slice(0, MAX_SOURCES);
                  // Avoid inserting duplicates if they already exist for this message
                  const existing = await this.researchSourceRepo.find({ where: { messageId: saved.id } as any });
                  const existsKey = new Set(existing.map(e => (e.url ? `url:${e.url.trim().toLowerCase()}` : `td:${(e.title||'').trim().toLowerCase()}|${(e.domain||'').trim().toLowerCase()}`)));
                  const toInsert = unique
                    .filter((s) => s.url || s.title || s.domain)
                    .filter((s) => !existsKey.has(s.url ? `url:${s.url.trim().toLowerCase()}` : `td:${(s.title||'').trim().toLowerCase()}|${(s.domain||'').trim().toLowerCase()}`))
                    .map((s) => this.researchSourceRepo.create({
                      messageId: saved.id,
                      url: s.url || null,
                      title: s.title || null,
                      domain: s.domain || null,
                      score: typeof s.score === 'number' ? s.score : null,
                    }));
                  if (toInsert.length) {
                    await this.researchSourceRepo.save(toInsert);
                  }
                }
                await this.researchSessionRepo.update(session!.id, {
                  messageCount: () => '"messageCount" + 1',
                  lastMessageAt: new Date(),
                } as any);
                savedAssistant = true;
              }
            }
          } catch {}
        },
      );

      // If no explicit final was emitted, persist whatever was assembled
      if (!savedAssistant) {
        const visible = stripThinkBlocks(assembledAssistant || '').trim();
        const thoughts = extractThinkBlocks(assembledAssistant || '').trim();
        if (visible) {
          const aiMsg = this.researchMessageRepo.create({
            sessionId: session!.id,
            userId,
            role: 'assistant',
            content: visible,
            metadata: { provider: 'perplexity' },
            thoughts: thoughts || null,
          });
          const saved = await this.researchMessageRepo.save(aiMsg);
          if (assembledSources.length) {
            const MAX_SOURCES = 8;
            const unique = assembledSources.slice(0, MAX_SOURCES);
            const existing = await this.researchSourceRepo.find({ where: { messageId: saved.id } as any });
            const existsKey = new Set(existing.map(e => (e.url ? `url:${e.url.trim().toLowerCase()}` : `td:${(e.title||'').trim().toLowerCase()}|${(e.domain||'').trim().toLowerCase()}`)));
            const toInsert = unique
              .filter((s) => s.url || s.title || s.domain)
              .filter((s) => !existsKey.has(s.url ? `url:${s.url.trim().toLowerCase()}` : `td:${(s.title||'').trim().toLowerCase()}|${(s.domain||'').trim().toLowerCase()}`))
              .map((s) => this.researchSourceRepo.create({
                messageId: saved.id,
                url: s.url || null,
                title: s.title || null,
                domain: s.domain || null,
                score: typeof s.score === 'number' ? s.score : null,
              }));
            if (toInsert.length) {
              await this.researchSourceRepo.save(toInsert);
            }
          }
          await this.researchSessionRepo.update(session!.id, {
            messageCount: () => '"messageCount" + 1',
            lastMessageAt: new Date(),
          } as any);
        }
      }
    } catch (error) {
      this.logger.error('Research stream failed', (error as any)?.stack);
      if (!res.headersSent) {
        res.status(503).json({ error: 'Research Stream Failed', detail: (error as Error).message });
      }
    } finally {
      try { res.end(); } catch {}
    }
  }

  /**
   * Slides streaming endpoint proxy
   * Proxies to Python slide orchestrator which emits NDJSON of per-slide events
   */
  @Post('teaching/slides/stream')
  @HttpCode(HttpStatus.OK)
  async streamSlides(@Body() body: any, @Res() res: any) {
    const { sessionId, userId, learningGoal, query } = body || {};
    if (!learningGoal && !query) {
      throw new HttpException(
        { error: 'Bad Request', detail: 'learningGoal or query is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders?.();

    try {
      await this.aiAgentClient.streamSlides(
        {
          sessionId: sessionId || `slides_${Date.now()}`,
          userId: userId || 'anonymous',
          learningGoal: learningGoal || query,
        },
        (chunk) => res.write(chunk),
      );
    } catch (error) {
      this.logger.error('Slides stream failed', (error as any)?.stack);
      if (!res.headersSent) {
        res.status(503).json({ error: 'Slides Stream Failed', detail: (error as Error).message });
      }
    } finally {
      try { res.end(); } catch {}
    }
  }

  /**
   * Report a teacher render error from the frontend and forward to Python teacher service for auto-fix
   */
  @Post('teacher/render-error')
  @HttpCode(HttpStatus.OK)
  async reportTeacherRenderError(@Body() body: any) {
    const { sessionId, userId, topic, code, error, timeline, platform } = body || {};
    if (!code || !error) {
      throw new HttpException({ error: 'Bad Request', detail: 'code and error are required' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.aiAgentClient.requestTeacherFix({ sessionId, userId, topic, code, error, timeline, platform });
      return result;
    } catch (e) {
      this.logger.error('Teacher render-error proxy failed', (e as any)?.stack);
      // Best-effort: return empty success so UI continues gracefully
      return { message: 'forward_failed' };
    }
  }

} 