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

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  picture?: string;

  @Column({ type: 'date', nullable: true })
  birthday?: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usagePurpose?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  userType?: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  preferences: Record<string, any>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  profile: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToOne(() => User, user => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id' })
  user: User;
} 