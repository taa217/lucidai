import { Controller, Post, Body } from '@nestjs/common';
import { SlidesPipelineService } from '../services/slides_pipeline.service';

@Controller('slides/pipeline')
export class SlidesPipelineController {
  constructor(private readonly slidesPipelineService: SlidesPipelineService) {}

  @Post()
  async generateSlides(@Body() body: { user_query: string, learning_goal: string }) {
    return await this.slidesPipelineService.generateSlides(body.user_query, body.learning_goal);
  }
} 