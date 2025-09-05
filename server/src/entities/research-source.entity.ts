import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ResearchMessage } from './research-message.entity';

@Entity('research_sources')
@Index(['messageId'])
export class ResearchSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  @Column({ type: 'float', nullable: true })
  score: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ResearchMessage, m => m.sources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: ResearchMessage;
}


































