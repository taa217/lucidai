import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ResearchMessage } from './research-message.entity';

@Entity('research_sessions')
@Index(['userId', 'updatedAt'])
export class ResearchSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ResearchMessage, m => m.session)
  messages: ResearchMessage[];
}














