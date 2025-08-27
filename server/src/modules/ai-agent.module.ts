import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIAgentController } from '../controllers/ai-agent.controller';
import { AIAgentClientService } from '../services/ai-agent-client.service';
import { AuthModule } from './auth.module';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { ResearchSession } from '../entities/research-session.entity';
import { ResearchMessage } from '../entities/research-message.entity';
import { ResearchSource } from '../entities/research-source.entity';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([ChatSession, ChatMessage, ResearchSession, ResearchMessage, ResearchSource]),
  ],
  controllers: [AIAgentController],
  providers: [AIAgentClientService],
  exports: [AIAgentClientService],
})
export class AIAgentModule {} 