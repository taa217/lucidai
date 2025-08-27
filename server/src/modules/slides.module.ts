import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SlidesController } from '../controllers/slides.controller';
import { SlidesService } from '../services/slides.service';
import { AIAgentClientService } from '../services/ai-agent-client.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
  ],
  controllers: [SlidesController],
  providers: [SlidesService, AIAgentClientService],
  exports: [SlidesService],
})
export class SlidesModule {} 