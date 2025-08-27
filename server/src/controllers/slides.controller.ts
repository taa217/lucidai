import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { SlidesService } from '../services/slides.service';
import {
  GenerateSlidesDto,
  UpdateSlideDto,
  SlideInteractionDto,
  GenerateVoiceDto,
} from '../dto/slides.dto';
import { SlideGenerationResponse, Deck } from '../../types/slides';

@ApiTags('slides')
@Controller('slides')
export class SlidesController {
  private readonly logger = new Logger(SlidesController.name);

  constructor(private readonly slidesService: SlidesService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a slide deck based on learning goals' })
  @ApiResponse({ 
    status: 200, 
    description: 'Slide deck generated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async generateSlides(
    @Body() dto: GenerateSlidesDto,
    @Req() req: Request,
  ): Promise<SlideGenerationResponse> {
    // Extract user ID from request (would come from auth in production)
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    this.logger.log(`Generating slides for user ${userId}: ${dto.learning_goal}`);
    
    return this.slidesService.generateSlides(dto, userId);
  }

  @Get(':deckId')
  @ApiOperation({ summary: 'Get a specific slide deck' })
  @ApiResponse({ 
    status: 200, 
    description: 'Slide deck retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Deck not found' })
  async getDeck(
    @Param('deckId') deckId: string,
    @Req() req: Request,
  ): Promise<Deck> {
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    this.logger.log(`Retrieving deck ${deckId} for user ${userId}`);
    
    return this.slidesService.getDeck(deckId, userId);
  }

  @Put('update')
  @ApiOperation({ summary: 'Update a specific slide in a deck' })
  @ApiResponse({ 
    status: 200, 
    description: 'Slide updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Deck or slide not found' })
  async updateSlide(
    @Body() dto: UpdateSlideDto,
    @Req() req: Request,
  ): Promise<Deck> {
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    this.logger.log(`Updating slide ${dto.slide_index} in deck ${dto.deck_id}`);
    
    return this.slidesService.updateSlide(dto, userId);
  }

  @Post('interact')
  @ApiOperation({ summary: 'Handle student interaction with a slide' })
  @ApiResponse({ 
    status: 200, 
    description: 'Interaction processed successfully' 
  })
  async handleInteraction(
    @Body() dto: SlideInteractionDto,
    @Req() req: Request,
  ): Promise<any> {
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    this.logger.log(
      `Processing ${dto.interaction_type} interaction for deck ${dto.deck_id}`
    );
    
    return this.slidesService.handleInteraction(dto, userId);
  }

  @Post('voice/generate')
  @ApiOperation({ summary: 'Generate voice narration for slides' })
  @ApiResponse({ 
    status: 202, 
    description: 'Voice generation started' 
  })
  async generateVoice(
    @Body() dto: GenerateVoiceDto,
    @Req() req: Request,
  ): Promise<any> {
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    this.logger.log(
      `Generating voice for ${dto.slide_indices.length} slides in deck ${dto.deck_id}`
    );
    
    return this.slidesService.generateVoice(dto, userId);
  }

  @Get('health/check')
  @ApiOperation({ summary: 'Check slide service health' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck(): Promise<any> {
    return {
      status: 'healthy',
      service: 'slides',
      timestamp: new Date().toISOString(),
    };
  }
} 