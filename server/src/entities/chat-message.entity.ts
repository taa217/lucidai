import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';
import { User } from './user.entity';

export type ChatRole = 'user' | 'assistant' | 'system';

@Entity('chat_messages')
@Index(['sessionId', 'createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  role: ChatRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ChatSession, session => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: ChatSession;

  @ManyToOne(() => User, user => (user as any).id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}


