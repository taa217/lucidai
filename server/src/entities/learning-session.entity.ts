import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

export enum SessionType {
  INTERACTIVE = 'interactive',
  READ = 'read',
  RESEARCH = 'research',
}

@Entity('learning_sessions')
@Index(['userId', 'status'])
@Index(['createdAt'])
export class LearningSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 500 })
  learningGoal: string;

  @Column({
    type: 'enum',
    enum: SessionType,
    default: SessionType.INTERACTIVE,
  })
  sessionType: SessionType;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.ACTIVE,
  })
  status: SessionStatus;

  @Column({ type: 'jsonb', nullable: true })
  deckData: any; // Store the generated slide deck

  @Column({ type: 'int', default: 0 })
  currentSlideIndex: number;

  @Column({ type: 'int', default: 0 })
  totalSlides: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  progress: Record<string, any>; // Track user progress through slides

  @Column({ type: 'jsonb', default: () => "'{}'" })
  interactions: Record<string, any>; // Store user interactions

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, any>; // Additional session metadata

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => SessionInteraction, interaction => interaction.session)
  sessionInteractions: SessionInteraction[];
}

@Entity('session_interactions')
@Index(['sessionId', 'createdAt'])
export class SessionInteraction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar', length: 100 })
  interactionType: string; // 'slide_view', 'voice_play', 'quiz_answer', etc.

  @Column({ type: 'int', nullable: true })
  slideIndex: number;

  @Column({ type: 'jsonb', nullable: true })
  interactionData: any; // Store interaction-specific data

  @Column({ type: 'timestamp', nullable: true })
  duration: number; // Duration in seconds if applicable

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => LearningSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: LearningSession;
} 