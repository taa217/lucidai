import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { UserDocument } from './user-document.entity';

@Entity('document_collections')
@Index(['userId'])
export class DocumentCollection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 7, default: '#3B82F6' })
  color: string;

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.collections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToMany(() => UserDocument, (document) => document.collections)
  documents: UserDocument[];

  // Virtual property for document count
  documentCount?: number;
} 