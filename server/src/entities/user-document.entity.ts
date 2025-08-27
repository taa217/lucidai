import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { DocumentCollection } from './document-collection.entity';

export enum DocumentType {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  EPUB = 'epub',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  OTHER = 'other',
}

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELETED = 'deleted',
}

@Entity('user_documents')
@Index(['userId', 'status'])
@Index(['userId', 'uploadDate'])
@Index(['filename'])
export class UserDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ type: 'bigint' })
  fileSize: number;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
    default: DocumentType.OTHER,
  })
  documentType: DocumentType;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.UPLOADED,
  })
  status: DocumentStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  uploadDate: Date;

  @Column({ type: 'text', array: true, default: [] })
  tags: string[];

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailPath: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  storagePath: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  extractedText: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToMany(() => DocumentCollection, (collection) => collection.documents)
  @JoinTable({
    name: 'document_collection_items',
    joinColumn: { name: 'documentId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'collectionId', referencedColumnName: 'id' },
  })
  collections: DocumentCollection[];
} 