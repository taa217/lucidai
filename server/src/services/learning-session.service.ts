import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningSession, SessionInteraction, SessionStatus, SessionType } from '../entities/learning-session.entity';
import { User } from '../entities/user.entity';

export interface CreateSessionDto {
  userId: string;
  learningGoal: string;
  sessionType: SessionType;
  deckData?: any;
}

export interface UpdateSessionDto {
  status?: SessionStatus;
  currentSlideIndex?: number;
  totalSlides?: number;
  progress?: Record<string, any>;
  interactions?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CreateInteractionDto {
  sessionId: string;
  interactionType: string;
  slideIndex?: number;
  interactionData?: any;
  duration?: number;
}

@Injectable()
export class LearningSessionService {
  constructor(
    @InjectRepository(LearningSession)
    private learningSessionRepository: Repository<LearningSession>,
    @InjectRepository(SessionInteraction)
    private sessionInteractionRepository: Repository<SessionInteraction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async createSession(createSessionDto: CreateSessionDto): Promise<LearningSession> {
    const user = await this.userRepository.findOne({ where: { id: createSessionDto.userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const session = this.learningSessionRepository.create({
      ...createSessionDto,
      status: SessionStatus.ACTIVE,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    });

    return this.learningSessionRepository.save(session);
  }

  async getSessionById(sessionId: string): Promise<LearningSession> {
    const session = await this.learningSessionRepository.findOne({
      where: { id: sessionId },
      relations: ['user', 'sessionInteractions'],
    });

    if (!session) {
      throw new Error('Session not found');
    }

    return session;
  }

  async getUserSessions(userId: string, limit = 10, offset = 0): Promise<LearningSession[]> {
    return this.learningSessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['sessionInteractions'],
    });
  }

  async updateSession(sessionId: string, updateSessionDto: UpdateSessionDto): Promise<LearningSession> {
    const session = await this.getSessionById(sessionId);
    
    // Update last activity
    updateSessionDto['lastActivityAt'] = new Date();

    // If completing session, set completedAt
    if (updateSessionDto.status === SessionStatus.COMPLETED && !session.completedAt) {
      updateSessionDto['completedAt'] = new Date();
    }

    await this.learningSessionRepository.update(sessionId, updateSessionDto);
    return this.getSessionById(sessionId);
  }

  async addInteraction(createInteractionDto: CreateInteractionDto): Promise<SessionInteraction> {
    const session = await this.getSessionById(createInteractionDto.sessionId);
    
    const interaction = this.sessionInteractionRepository.create({
      ...createInteractionDto,
      createdAt: new Date(),
    });

    const savedInteraction = await this.sessionInteractionRepository.save(interaction);

    // Update session's last activity
    await this.learningSessionRepository.update(session.id, {
      lastActivityAt: new Date(),
    });

    return savedInteraction;
  }

  async getSessionInteractions(sessionId: string, limit = 50, offset = 0): Promise<SessionInteraction[]> {
    return this.sessionInteractionRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getUserAnalytics(userId: string): Promise<any> {
    const sessions = await this.learningSessionRepository.find({
      where: { userId },
      relations: ['sessionInteractions'],
    });

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === SessionStatus.COMPLETED).length;
    const activeSessions = sessions.filter(s => s.status === SessionStatus.ACTIVE).length;

    const totalInteractions = sessions.reduce((sum, session) => 
      sum + session.sessionInteractions.length, 0
    );

    const averageSessionDuration = sessions
      .filter(s => s.completedAt && s.startedAt)
      .reduce((sum, session) => {
        const duration = session.completedAt.getTime() - session.startedAt.getTime();
        return sum + duration;
      }, 0) / Math.max(completedSessions, 1);

    const sessionTypeBreakdown = sessions.reduce((acc, session) => {
      acc[session.sessionType] = (acc[session.sessionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const recentActivity = sessions
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
      .slice(0, 5)
      .map(session => ({
        id: session.id,
        learningGoal: session.learningGoal,
        status: session.status,
        lastActivityAt: session.lastActivityAt,
        currentSlideIndex: session.currentSlideIndex,
        totalSlides: session.totalSlides,
      }));

    return {
      totalSessions,
      completedSessions,
      activeSessions,
      completionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
      totalInteractions,
      averageSessionDuration: Math.round(averageSessionDuration / 1000 / 60), // in minutes
      sessionTypeBreakdown,
      recentActivity,
    };
  }

  async getSessionAnalytics(sessionId: string): Promise<any> {
    const session = await this.getSessionById(sessionId);
    const interactions = await this.getSessionInteractions(sessionId, 1000, 0);

    const interactionTypes = interactions.reduce((acc, interaction) => {
      acc[interaction.interactionType] = (acc[interaction.interactionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const slideEngagement = interactions.reduce((acc, interaction) => {
      if (interaction.slideIndex !== null) {
        acc[interaction.slideIndex] = (acc[interaction.slideIndex] || 0) + 1;
      }
      return acc;
    }, {} as Record<number, number>);

    const totalDuration = session.completedAt && session.startedAt 
      ? session.completedAt.getTime() - session.startedAt.getTime()
      : 0;

    return {
      sessionId: session.id,
      learningGoal: session.learningGoal,
      status: session.status,
      totalSlides: session.totalSlides,
      currentSlideIndex: session.currentSlideIndex,
      totalInteractions: interactions.length,
      interactionTypes,
      slideEngagement,
      totalDuration: Math.round(totalDuration / 1000 / 60), // in minutes
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      lastActivityAt: session.lastActivityAt,
    };
  }

  async cleanupOldSessions(daysOld = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.learningSessionRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .andWhere('status IN (:...statuses)', { 
        statuses: [SessionStatus.COMPLETED, SessionStatus.ABANDONED] 
      })
      .execute();

    return result.affected || 0;
  }

  async getActiveSessions(): Promise<LearningSession[]> {
    return this.learningSessionRepository.find({
      where: { status: SessionStatus.ACTIVE },
      relations: ['user'],
      order: { lastActivityAt: 'DESC' },
    });
  }

  async abandonInactiveSessions(hoursInactive = 24): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursInactive);

    const result = await this.learningSessionRepository
      .createQueryBuilder()
      .update()
      .set({ 
        status: SessionStatus.ABANDONED,
        updatedAt: new Date(),
      })
      .where('status = :status', { status: SessionStatus.ACTIVE })
      .andWhere('lastActivityAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
} 