import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum VoiceProvider {
  ELEVENLABS = 'elevenlabs',
  AZURE = 'azure',
  GTTS = 'gtts',
}

export enum VoiceQuality {
  FAST = 'fast',
  BALANCED = 'balanced',
  HIGH = 'high',
}

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  // Voice Settings
  @Column({
    type: 'enum',
    enum: VoiceProvider,
    default: VoiceProvider.ELEVENLABS,
  })
  preferredVoiceProvider: VoiceProvider;

  @Column({
    type: 'enum',
    enum: VoiceQuality,
    default: VoiceQuality.BALANCED,
  })
  voiceQuality: VoiceQuality;

  @Column({ type: 'varchar', length: 100, default: 'elevenlabs_neural' })
  voiceId: string;

  @Column({ type: 'float', default: 1.0 })
  voiceSpeed: number;

  @Column({ type: 'boolean', default: true })
  voiceEnabled: boolean;

  // UI Settings
  @Column({ type: 'varchar', length: 50, default: 'light' })
  theme: string; // 'light', 'dark', 'auto'

  @Column({ type: 'boolean', default: false })
  reducedMotion: boolean;

  @Column({ type: 'boolean', default: false })
  highContrast: boolean;

  @Column({ type: 'varchar', length: 10, default: 'English' })
  language: string;

  // Learning Preferences
  @Column({ type: 'varchar', length: 50, default: 'beginner' })
  difficultyLevel: string; // 'beginner', 'intermediate', 'advanced'

  @Column({ type: 'boolean', default: true })
  showHints: boolean;

  @Column({ type: 'boolean', default: true })
  autoAdvance: boolean;

  @Column({ type: 'int', default: 5 })
  autoAdvanceDelay: number; // seconds

  // Notification Settings
  @Column({ type: 'boolean', default: true })
  emailNotifications: boolean;

  @Column({ type: 'boolean', default: true })
  pushNotifications: boolean;

  @Column({ type: 'boolean', default: false })
  marketingEmails: boolean;

  // Privacy Settings
  @Column({ type: 'boolean', default: true })
  dataCollection: boolean;

  @Column({ type: 'boolean', default: false })
  analyticsOptOut: boolean;

  // Custom preferences stored as JSON
  @Column({ type: 'jsonb', default: () => "'{}'" })
  customPreferences: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToOne(() => User, user => user.preferences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
} 