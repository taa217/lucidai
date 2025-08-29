import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_customizations')
export class UserCustomization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  displayName?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  occupation?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  traits?: string | null;

  @Column({ type: 'text', nullable: true })
  extraNotes?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  preferredLanguage?: string | null; // Human-readable, e.g., "English"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, user => (user as any).customization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}





























