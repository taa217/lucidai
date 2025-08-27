import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeepPartial } from 'typeorm';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';

@Controller('api/chat')
export class ChatController {
  constructor(
    @InjectRepository(ChatSession)
    private readonly chatSessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepo: Repository<ChatMessage>,
  ) {}

  @Get('sessions')
  async listSessions(
    @Query('userId') userId: string,
    @Query('limit') limit = '20',
  ): Promise<ChatSession[]> {
    const take = Math.min(parseInt(limit || '20', 10) || 20, 100);
    return this.chatSessionRepo.find({
      where: { userId } as any,
      order: { updatedAt: 'DESC' },
      take,
    });
  }

  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string): Promise<ChatSession | null> {
    return this.chatSessionRepo.findOne({ where: { id: sessionId } as any });
  }

  @Get('sessions/:sessionId/messages')
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit = '100',
  ): Promise<ChatMessage[]> {
    const take = Math.min(parseInt(limit || '100', 10) || 100, 500);
    return this.chatMessageRepo.find({
      where: { sessionId } as any,
      order: { createdAt: 'ASC' },
      take,
    });
  }

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  async upsertSession(@Body() body: Partial<ChatSession>): Promise<ChatSession> {
    const payload: DeepPartial<ChatSession> = body as any;
    const entity = this.chatSessionRepo.create(payload);
    const saved = await this.chatSessionRepo.save(entity);
    return saved as ChatSession;
  }
}


