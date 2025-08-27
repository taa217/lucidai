import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Entity('user_auth')
export class UserAuth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude()
  password?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  googleId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workosId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationCode?: string;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpires?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordResetToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastPasswordChangeAt?: Date;

  @Column({ type: 'int', default: 0 })
  loginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockedUntil?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToOne(() => User, user => user.auth, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id' })
  user: User;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  async validatePassword(password: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(password, this.password);
  }

  resetLoginAttempts(): void {
    this.loginAttempts = 0;
  }

  incrementLoginAttempts(): void {
    this.loginAttempts += 1;
  }

  isLocked(): boolean {
    return this.lockedUntil ? new Date() < this.lockedUntil : false;
  }
} 