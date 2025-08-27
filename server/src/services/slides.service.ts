import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { GenerateSlidesDto, UpdateSlideDto, SlideInteractionDto, GenerateVoiceDto } from '../dto/slides.dto';
import { Deck, SlideGenerationResponse } from '../../types/slides';

@Injectable()
export class SlidesService {
  private readonly logger = new Logger(SlidesService.name);
  private readonly slideServiceUrl: string;
  private readonly voiceServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const serviceHost = this.configService.get<string>('SERVICE_HOST', 'localhost');
    this.slideServiceUrl = `http://${serviceHost}:8005`;
    this.voiceServiceUrl = `http://${serviceHost}:8005`;
  }

  async generateSlides(dto: GenerateSlidesDto, userId: string): Promise<SlideGenerationResponse> {
    try {
      this.logger.log(`Generating slides for user ${userId}: ${dto.learning_goal}`);

      const response: AxiosResponse<SlideGenerationResponse> = await firstValueFrom(
        this.httpService.post<SlideGenerationResponse>(
          `${this.slideServiceUrl}/generate`,
          {
            user_id: userId,
            learning_goal: dto.learning_goal,
            uploaded_documents: dto.uploaded_documents || [],
            preferred_duration_minutes: dto.preferred_duration_minutes,
            difficulty_level: dto.difficulty_level,
            include_practice: dto.include_practice,
            visual_style: dto.visual_style,
            max_slides: dto.max_slides,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-User-ID': userId,
            },
            timeout: 120000, // 120 second timeout for slide generation
          },
        ),
      );

      if (!response.data || response.data.status === 'failed') {
        throw new HttpException(
          response.data?.warnings?.join(', ') || 'Slide generation failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.log(
        `Generated ${response.data.deck.slides.length} slides in ${response.data.generation_time_seconds}s`,
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error generating slides:', error);
      
      if (error.response?.data) {
        throw new HttpException(
          error.response.data.detail || 'Slide generation service error',
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      
      throw new HttpException(
        'Failed to connect to slide generation service',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDeck(deckId: string, userId: string): Promise<Deck> {
    // TODO: Implement deck retrieval from storage
    // For now, this is a placeholder
    throw new HttpException('Deck retrieval not yet implemented', HttpStatus.NOT_IMPLEMENTED);
  }

  async updateSlide(dto: UpdateSlideDto, userId: string): Promise<Deck> {
    try {
      this.logger.log(`Updating slide ${dto.slide_index} in deck ${dto.deck_id}`);

      // TODO: Implement slide update logic
      // This would involve:
      // 1. Retrieving the deck
      // 2. Validating user ownership
      // 3. Updating the specific slide
      // 4. Saving the deck
      // 5. Optionally regenerating voice for that slide

      throw new HttpException('Slide update not yet implemented', HttpStatus.NOT_IMPLEMENTED);
    } catch (error) {
      this.logger.error('Error updating slide:', error);
      throw error;
    }
  }

  async handleInteraction(dto: SlideInteractionDto, userId: string): Promise<any> {
    try {
      this.logger.log(
        `Handling ${dto.interaction_type} interaction for slide ${dto.current_slide_index} in deck ${dto.deck_id}`,
      );

      // Route to appropriate handler based on interaction type
      switch (dto.interaction_type) {
        case 'quiz_answer':
          return this.handleQuizAnswer(dto, userId);
        case 'feedback':
          return this.handleFeedback(dto, userId);
        case 'request_clarification':
          return this.handleClarificationRequest(dto, userId);
        case 'skip':
          return this.handleSkipRequest(dto, userId);
        case 'repeat':
          return this.handleRepeatRequest(dto, userId);
        default:
          throw new HttpException('Unknown interaction type', HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      this.logger.error('Error handling interaction:', error);
      throw error;
    }
  }

  async generateVoice(dto: GenerateVoiceDto, userId: string): Promise<any> {
    try {
      this.logger.log(`Generating voice for ${dto.slide_indices.length} slides in deck ${dto.deck_id}`);

      // TODO: Retrieve deck and extract speaker notes for specified slides
      // Then call voice synthesis service

      const voiceRequests = dto.slide_indices.map(index => ({
        slide_index: index,
        // text: deck.slides[index].speaker_notes,
        voice_id: dto.voice_id,
        speed: dto.voice_speed,
      }));

      // TODO: Call voice service
      // const response = await firstValueFrom(
      //   this.httpService.post(`${this.voiceServiceUrl}/synthesize/batch`, voiceRequests)
      // );

      throw new HttpException('Voice generation not yet implemented', HttpStatus.NOT_IMPLEMENTED);
    } catch (error) {
      this.logger.error('Error generating voice:', error);
      throw error;
    }
  }

  // Private helper methods for interactions
  private async handleQuizAnswer(dto: SlideInteractionDto, userId: string): Promise<any> {
    // TODO: Process quiz answer and determine next action
    return {
      correct: false,
      feedback: 'Quiz processing not yet implemented',
      next_action: 'continue',
    };
  }

  private async handleFeedback(dto: SlideInteractionDto, userId: string): Promise<any> {
    // TODO: Process feedback and potentially adapt the deck
    return {
      acknowledged: true,
      message: 'Thank you for your feedback',
    };
  }

  private async handleClarificationRequest(dto: SlideInteractionDto, userId: string): Promise<any> {
    // TODO: Generate additional explanation or examples
    return {
      clarification: 'Clarification generation not yet implemented',
      additional_slides: [],
    };
  }

  private async handleSkipRequest(dto: SlideInteractionDto, userId: string): Promise<any> {
    // TODO: Determine which slides can be safely skipped
    return {
      skip_to_slide: dto.current_slide_index + 1,
      skipped_slides: [],
    };
  }

  private async handleRepeatRequest(dto: SlideInteractionDto, userId: string): Promise<any> {
    // TODO: Potentially regenerate the slide with different examples
    return {
      repeat_slide: dto.current_slide_index,
      modified: false,
    };
  }
} 