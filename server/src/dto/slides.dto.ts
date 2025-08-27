import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsEnum, Min, Max, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DifficultyLevel {
  AUTO = 'auto',
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum VisualStyle {
  MODERN = 'modern',
  ACADEMIC = 'academic',
  PLAYFUL = 'playful',
  MINIMAL = 'minimal',
}

export class GenerateSlidesDto {
  @ApiProperty({ description: 'The learning goal or topic the user wants to learn' })
  @IsString()
  learning_goal: string;

  @ApiPropertyOptional({ description: 'Array of uploaded document IDs to use as sources' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  uploaded_documents?: string[];

  @ApiPropertyOptional({ description: 'Preferred lesson duration in minutes', minimum: 5, maximum: 120, default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(120)
  preferred_duration_minutes?: number = 20;

  @ApiPropertyOptional({ 
    description: 'Difficulty level for the content',
    enum: DifficultyLevel,
    default: DifficultyLevel.AUTO 
  })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty_level?: DifficultyLevel = DifficultyLevel.AUTO;

  @ApiPropertyOptional({ description: 'Include practice problems and exercises', default: true })
  @IsOptional()
  @IsBoolean()
  include_practice?: boolean = true;

  @ApiPropertyOptional({ 
    description: 'Visual style for the slides',
    enum: VisualStyle,
    default: VisualStyle.MODERN 
  })
  @IsOptional()
  @IsEnum(VisualStyle)
  visual_style?: VisualStyle = VisualStyle.MODERN;

  @ApiPropertyOptional({ description: 'Maximum number of slides', minimum: 3, maximum: 50, default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(50)
  max_slides?: number = 30;
}

export class UpdateSlideDto {
  @ApiProperty({ description: 'Deck ID' })
  @IsUUID()
  deck_id: string;

  @ApiProperty({ description: 'Slide index to update' })
  @IsNumber()
  @Min(0)
  slide_index: number;

  @ApiPropertyOptional({ description: 'New content for the slide' })
  @IsOptional()
  content?: any;

  @ApiPropertyOptional({ description: 'New speaker notes' })
  @IsOptional()
  @IsString()
  speaker_notes?: string;

  @ApiPropertyOptional({ description: 'New duration in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(300)
  duration_seconds?: number;
}

export class SlideInteractionDto {
  @ApiProperty({ description: 'Deck ID' })
  @IsUUID()
  deck_id: string;

  @ApiProperty({ description: 'Current slide index' })
  @IsNumber()
  @Min(0)
  current_slide_index: number;

  @ApiProperty({ description: 'Type of interaction' })
  @IsString()
  interaction_type: 'quiz_answer' | 'feedback' | 'request_clarification' | 'skip' | 'repeat';

  @ApiPropertyOptional({ description: 'Interaction data (e.g., quiz answer, feedback text)' })
  @IsOptional()
  data?: any;
}

export class GenerateVoiceDto {
  @ApiProperty({ description: 'Deck ID' })
  @IsUUID()
  deck_id: string;

  @ApiProperty({ description: 'Slide indices to generate voice for' })
  @IsArray()
  @IsNumber({}, { each: true })
  slide_indices: number[];

  @ApiPropertyOptional({ description: 'Voice ID to use' })
  @IsOptional()
  @IsString()
  voice_id?: string;

  @ApiPropertyOptional({ description: 'Voice speed multiplier', minimum: 0.5, maximum: 2.0, default: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  voice_speed?: number = 1.0;
} 