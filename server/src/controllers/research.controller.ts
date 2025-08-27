import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import type { DeepPartial } from 'typeorm';
import { ResearchSession } from '../entities/research-session.entity';
import { ResearchMessage } from '../entities/research-message.entity';
import { ResearchSource } from '../entities/research-source.entity';

@Controller('api/research')
export class ResearchController {
  constructor(
    @InjectRepository(ResearchSession)
    private readonly sessionRepo: Repository<ResearchSession>,
    @InjectRepository(ResearchMessage)
    private readonly messageRepo: Repository<ResearchMessage>,
    @InjectRepository(ResearchSource)
    private readonly sourceRepo: Repository<ResearchSource>,
  ) {}

  @Get('sessions')
  async listSessions(
    @Query('userId') userId: string,
    @Query('limit') limit = '20',
  ): Promise<ResearchSession[]> {
    const take = Math.min(parseInt(limit || '20', 10) || 20, 100);
    return this.sessionRepo.find({ where: { userId } as any, order: { updatedAt: 'DESC' } as any, take });
  }

  @Get('sessions/:sessionId/messages')
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit = '200',
  ): Promise<(ResearchMessage & { sources: ResearchSource[] })[]> {
    const take = Math.min(parseInt(limit || '200', 10) || 200, 500);
    const messages = await this.messageRepo.find({ where: { sessionId } as any, order: { createdAt: 'ASC' } as any, take });
    const ids = messages.map(m => m.id);
    const allSources = ids.length ? await this.sourceRepo.find({ where: { messageId: In(ids) } as any }) : [];
    const map = new Map<string, ResearchSource[]>();
    for (const s of allSources) {
      const arr = map.get(s.messageId) || [];
      arr.push(s);
      map.set(s.messageId, arr);
    }
    return messages.map(m => ({ ...m, sources: map.get(m.id) || [] }));
  }

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  async upsertSession(@Body() body: Partial<ResearchSession>): Promise<ResearchSession> {
    const payload: DeepPartial<ResearchSession> = body as any;
    const entity = this.sessionRepo.create(payload);
    const saved = await this.sessionRepo.save(entity);
    return saved as ResearchSession;
  }
}


