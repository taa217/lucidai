import { Module } from '@nestjs/common';
import { SlidesPipelineController } from '../controllers/slides_pipeline.controller';
import { SlidesPipelineService } from '../services/slides_pipeline.service';

@Module({
  controllers: [SlidesPipelineController],
  providers: [SlidesPipelineService],
})
export class SlidesPipelineModule {} 