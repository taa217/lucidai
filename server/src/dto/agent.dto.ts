import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsEnum, IsNumber, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
}

export enum DifficultyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum LearningStyle {
  VISUAL = 'visual',
  AUDITORY = 'auditory',
  KINESTHETIC = 'kinesthetic',
  BALANCED = 'balanced',
}

export class ConversationMessageDto {
  @ApiProperty({ enum: MessageRole })
  @IsEnum(MessageRole)
  role: MessageRole;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Message timestamp' })
  @IsOptional()
  timestamp?: Date;

  @ApiPropertyOptional({ description: 'Additional message metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class AgentRequestDto {
  @ApiProperty({ description: 'Unique session identifier' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'User identifier' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'User message to process' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ 
    type: [ConversationMessageDto], 
    description: 'Previous conversation history' 
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  conversationHistory?: ConversationMessageDto[];

  @ApiPropertyOptional({ 
    enum: LLMProvider, 
    description: 'Preferred LLM provider' 
  })
  @IsOptional()
  @IsEnum(LLMProvider)
  preferredProvider?: LLMProvider;

  @ApiPropertyOptional({ description: 'Additional context data' })
  @IsOptional()
  context?: Record<string, any>;
}

export class AgentResponseDto {
  @ApiProperty({ description: 'Session identifier' })
  sessionId: string;

  @ApiProperty({ description: 'Agent response' })
  response: string;

  @ApiProperty({ description: 'Response confidence score', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiProperty({ enum: LLMProvider, description: 'LLM provider used' })
  @IsEnum(LLMProvider)
  providerUsed: LLMProvider;

  @ApiProperty({ description: 'Processing time in milliseconds' })
  @IsNumber()
  processingTimeMs: number;

  @ApiPropertyOptional({ description: 'Response metadata' })
  metadata?: Record<string, any>;
}

// Teaching Content Service DTOs
export class CurriculumRequestDto {
  @ApiProperty({ description: 'User identifier' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Learning goals and objectives' })
  @IsString()
  learningGoals: string;

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'List of uploaded document IDs' 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  uploadedDocuments?: string[];

  @ApiProperty({ 
    enum: DifficultyLevel, 
    description: 'Learning difficulty level',
    default: DifficultyLevel.INTERMEDIATE
  })
  @IsEnum(DifficultyLevel)
  difficultyLevel: DifficultyLevel;

  @ApiProperty({ 
    enum: LearningStyle, 
    description: 'Preferred learning style',
    default: LearningStyle.BALANCED
  })
  @IsEnum(LearningStyle)
  learningStyle: LearningStyle;

  @ApiProperty({ 
    description: 'Desired session duration in minutes',
    minimum: 5,
    maximum: 180
  })
  @IsNumber()
  @Min(5)
  @Max(180)
  sessionDuration: number;
}

export class CurriculumModuleDto {
  @ApiProperty({ description: 'Module identifier' })
  id: string;

  @ApiProperty({ description: 'Module title' })
  title: string;

  @ApiProperty({ description: 'Module duration in minutes' })
  duration: number;

  @ApiProperty({ description: 'Module status' })
  status: string;

  @ApiPropertyOptional({ description: 'Module content description' })
  content?: string;

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'Module activities' 
  })
  activities?: string[];
}

export class CurriculumResponseDto {
  @ApiProperty({ description: 'Generated curriculum identifier' })
  curriculumId: string;

  @ApiProperty({ description: 'User identifier' })
  userId: string;

  @ApiProperty({ description: 'Curriculum title' })
  title: string;

  @ApiProperty({ description: 'Learning goals' })
  learningGoals: string;

  @ApiProperty({ enum: DifficultyLevel })
  difficultyLevel: DifficultyLevel;

  @ApiProperty({ description: 'Total curriculum duration in minutes' })
  totalDuration: number;

  @ApiProperty({ 
    type: [CurriculumModuleDto], 
    description: 'Curriculum modules' 
  })
  modules: CurriculumModuleDto[];

  @ApiPropertyOptional({ description: 'Document sources used' })
  documentSources?: Record<string, any>;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: string;
}

export class WhiteboardContentRequestDto {
  @ApiProperty({ description: 'Curriculum identifier' })
  @IsString()
  curriculumId: string;

  @ApiProperty({ 
    description: 'Module index to generate content for',
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  moduleIndex: number;

  @ApiProperty({ description: 'User identifier' })
  @IsString()
  userId: string;
}

export class WhiteboardSegmentDto {
  @ApiProperty({ description: 'Segment identifier' })
  id: string;

  @ApiProperty({ description: 'Voice narration text' })
  voiceText: string;

  @ApiProperty({ description: 'Visual content to display' })
  visualContent: string;

  @ApiPropertyOptional({ description: 'Content coordinates' })
  coordinates?: Record<string, any>;

  @ApiProperty({ description: 'Segment duration in seconds' })
  durationSeconds: number;

  @ApiProperty({ description: 'Visual action type (write, highlight, etc.)' })
  visualAction: string;
}

export class WhiteboardContentResponseDto {
  @ApiProperty({ description: 'Teaching session identifier' })
  sessionId: string;

  @ApiProperty({ description: 'Curriculum identifier' })
  curriculumId: string;

  @ApiProperty({ description: 'Module index' })
  moduleIndex: number;

  @ApiProperty({ 
    type: [WhiteboardSegmentDto], 
    description: 'Teaching segments' 
  })
  segments: WhiteboardSegmentDto[];

  @ApiProperty({ description: 'Estimated duration in seconds' })
  estimatedDuration: number;

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'Learning objectives' 
  })
  learningObjectives?: string[];
}

export class HealthCheckDto {
  @ApiProperty({ description: 'Service name' })
  service: string;

  @ApiProperty({ description: 'Service status' })
  status: string;

  @ApiProperty({ description: 'Health check timestamp' })
  timestamp: Date;

  @ApiProperty({ description: 'Service version' })
  version: string;
}

export class ErrorResponseDto {
  @ApiProperty({ description: 'Error message' })
  error: string;

  @ApiPropertyOptional({ description: 'Detailed error information' })
  detail?: string;

  @ApiProperty({ description: 'Error timestamp' })
  timestamp: Date;
}

// Voice Synthesis DTOs
export class VoiceSynthesisRequestDto {
  @ApiProperty({ description: 'Text to convert to speech' })
  @IsString()
  text: string;

  @ApiProperty({ 
    description: 'Voice type',
    default: 'neural',
    enum: ['neural', 'standard', 'teaching']
  })
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiProperty({ 
    description: 'Speech speed',
    minimum: 0.5,
    maximum: 2.0,
    default: 1.0
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  speed?: number;

  @ApiProperty({ 
    description: 'Voice pitch',
    default: 'medium',
    enum: ['low', 'medium', 'high']
  })
  @IsOptional()
  @IsString()
  pitch?: string;

  @ApiProperty({ 
    description: 'Voice emotion/style',
    default: 'friendly',
    enum: ['friendly', 'professional', 'enthusiastic']
  })
  @IsOptional()
  @IsString()
  emotion?: string;

  @ApiProperty({ 
    description: 'Language code',
    default: 'en-US'
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ 
    description: 'Voice quality preference',
    default: 'balanced',
    enum: ['fast', 'balanced', 'high']
  })
  @IsOptional()
  @IsString()
  quality?: string;

  @ApiProperty({ 
    description: 'Preferred voice provider',
    enum: ['elevenlabs', 'azure', 'gtts']
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ 
    description: 'Voice model (for ElevenLabs)',
    enum: ['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5']
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ 
    description: 'Specific voice ID (for ElevenLabs)'
  })
  @IsOptional()
  @IsString()
  voice_id?: string;
}

export class VoiceSynthesisResponseDto {
  @ApiProperty({ description: 'Audio identifier for retrieval' })
  audioId: string;

  @ApiProperty({ description: 'Audio duration in seconds' })
  durationSeconds: number;

  @ApiProperty({ description: 'Voice used for synthesis' })
  voiceUsed: string;

  @ApiProperty({ description: 'Provider used for synthesis' })
  providerUsed: string;

  @ApiPropertyOptional({ description: 'Model used for synthesis (if applicable)' })
  modelUsed?: string;

  @ApiProperty({ description: 'Whether result was cached' })
  cacheHit: boolean;

  @ApiProperty({ description: 'Synthesis timestamp' })
  timestamp: string;
} 