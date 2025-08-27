import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { UserDocument } from './user-document.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_sessions')
@Index(['userId', 'updatedAt'])
@Index(['userId', 'docId', 'updatedAt'])
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  docId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  modelProvider: string | null; // 'openai' | 'anthropic' | 'google'

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  lastMessagePreview: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, user => (user as any).id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => UserDocument, doc => (doc as any).id, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'docId' })
  document: UserDocument | null;

  @OneToMany(() => ChatMessage, message => message.session)
  messages: ChatMessage[];
}


