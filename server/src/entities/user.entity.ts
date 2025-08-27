import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UserAuth } from './user-auth.entity';
import { UserProfile } from './user-profile.entity';
import { UserPreferences } from './user-preferences.entity';
import { LearningSession } from './learning-session.entity';
import { UserDocument } from './user-document.entity';
import { DocumentCollection } from './document-collection.entity';

export enum UserRole {
  STUDENT = 'student',
  TEACHER = 'teacher',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
}

// Main user entity - updated for normalized schema
@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.STUDENT,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDING_VERIFICATION,
  })
  status: UserStatus;

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToOne(() => UserAuth, auth => auth.user, { cascade: true })
  @JoinColumn({ name: 'id' })
  auth: UserAuth;

  @OneToOne(() => UserProfile, profile => profile.user, { cascade: true })
  @JoinColumn({ name: 'id' })
  profile: UserProfile;

  @OneToOne(() => UserPreferences, preferences => preferences.user, { cascade: true })
  @JoinColumn({ name: 'id' })
  preferences: UserPreferences;

  @OneToMany(() => LearningSession, session => session.user)
  learningSessions: LearningSession[];

  @OneToMany(() => UserDocument, document => document.user)
  documents: UserDocument[];

  @OneToMany(() => DocumentCollection, collection => collection.user)
  collections: DocumentCollection[];

  // Helper methods for backward compatibility
  get password(): string | undefined {
    return this.auth?.password;
  }

  set password(value: string | undefined) {
    if (this.auth) {
      this.auth.password = value;
    }
  }

  get googleId(): string | undefined {
    return this.auth?.googleId;
  }

  set googleId(value: string | undefined) {
    if (this.auth) {
      this.auth.googleId = value;
    }
  }

  get picture(): string | undefined {
    return this.profile?.picture;
  }

  set picture(value: string | undefined) {
    if (this.profile) {
      this.profile.picture = value;
    }
  }

  get birthday(): Date | undefined {
    return this.profile?.birthday;
  }

  set birthday(value: Date | undefined) {
    if (this.profile) {
      this.profile.birthday = value;
    }
  }

  get usagePurpose(): string | undefined {
    return this.profile?.usagePurpose;
  }

  set usagePurpose(value: string | undefined) {
    if (this.profile) {
      this.profile.usagePurpose = value;
    }
  }

  get userType(): string | undefined {
    return this.profile?.userType;
  }

  set userType(value: string | undefined) {
    if (this.profile) {
      this.profile.userType = value;
    }
  }

  get emailVerificationCode(): string | undefined {
    return this.auth?.emailVerificationCode;
  }

  set emailVerificationCode(value: string | undefined) {
    if (this.auth) {
      this.auth.emailVerificationCode = value;
    }
  }

  get emailVerificationExpires(): Date | undefined {
    return this.auth?.emailVerificationExpires;
  }

  set emailVerificationExpires(value: Date | undefined) {
    if (this.auth) {
      this.auth.emailVerificationExpires = value;
    }
  }

  get passwordResetToken(): string | undefined {
    return this.auth?.passwordResetToken;
  }

  set passwordResetToken(value: string | undefined) {
    if (this.auth) {
      this.auth.passwordResetToken = value;
    }
  }

  get passwordResetExpires(): Date | undefined {
    return this.auth?.passwordResetExpires;
  }

  set passwordResetExpires(value: Date | undefined) {
    if (this.auth) {
      this.auth.passwordResetExpires = value;
    }
  }

  get lastLoginAt(): Date | undefined {
    return this.auth?.lastLoginAt;
  }

  set lastLoginAt(value: Date | undefined) {
    if (this.auth) {
      this.auth.lastLoginAt = value;
    }
  }

  get lastPasswordChangeAt(): Date | undefined {
    return this.auth?.lastPasswordChangeAt;
  }

  set lastPasswordChangeAt(value: Date | undefined) {
    if (this.auth) {
      this.auth.lastPasswordChangeAt = value;
    }
  }

  get loginAttempts(): number {
    return this.auth?.loginAttempts || 0;
  }

  set loginAttempts(value: number) {
    if (this.auth) {
      this.auth.loginAttempts = value;
    }
  }

  get lockedUntil(): Date | undefined {
    return this.auth?.lockedUntil;
  }

  set lockedUntil(value: Date | undefined) {
    if (this.auth) {
      this.auth.lockedUntil = value;
    }
  }

  async validatePassword(password: string): Promise<boolean> {
    return this.auth?.validatePassword(password) || false;
  }

  resetLoginAttempts(): void {
    this.auth?.resetLoginAttempts();
  }

  incrementLoginAttempts(): void {
    this.auth?.incrementLoginAttempts();
  }

  isLocked(): boolean {
    return this.auth?.isLocked() || false;
  }
} 