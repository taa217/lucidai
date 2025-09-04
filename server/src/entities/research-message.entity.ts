import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ResearchSession } from './research-session.entity';
import { ResearchSource } from './research-source.entity';

export type ResearchRole = 'user' | 'assistant';

@Entity('research_messages')
export class ResearchMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  role: ResearchRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  thoughts: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ResearchSession, s => s.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: ResearchSession;

  @OneToMany(() => ResearchSource, src => src.message, { cascade: true })
  sources: ResearchSource[];
}

































