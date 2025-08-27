import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../entities/user.entity';
import { UserAuth } from '../entities/user-auth.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { UserPreferences } from '../entities/user-preferences.entity';
import { UserCustomization } from '../entities/user-customization.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAuth)
    private readonly userAuthRepository: Repository<UserAuth>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(UserPreferences)
    private readonly userPreferencesRepository: Repository<UserPreferences>,
    @InjectRepository(UserCustomization)
    private readonly userCustomizationRepository: Repository<UserCustomization>,
  ) {}

  async createUser(userData: {
    fullName: string;
    email: string;
    password: string;
    birthday?: Date;
    usagePurpose?: string;
    userType?: string;
  }): Promise<any> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ 
      where: { email: userData.email.toLowerCase() },
      relations: ['auth', 'profile', 'preferences']
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Generate a secure 6-digit code and expiry (15 min)
    const code = (Math.floor(100000 + Math.random() * 900000)).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    // Create user with related entities
    const user = new User();
    user.fullName = userData.fullName;
    user.email = userData.email.toLowerCase();
    user.status = UserStatus.PENDING_VERIFICATION;
    user.role = UserRole.STUDENT;
    user.emailVerified = false;

    // Save user first to get the ID
    const savedUser = await this.userRepository.save(user);

    // Create related entities with the user ID
    const userAuth = new UserAuth();
    userAuth.id = savedUser.id;
    userAuth.password = userData.password; // Will be hashed by entity hook
    userAuth.emailVerificationCode = code;
    userAuth.emailVerificationExpires = expiry;
    userAuth.loginAttempts = 0;

    const userProfile = new UserProfile();
    userProfile.id = savedUser.id;
    userProfile.birthday = userData.birthday;
    userProfile.usagePurpose = userData.usagePurpose;
    userProfile.userType = userData.userType;
    userProfile.preferences = {};
    userProfile.profile = {};

    const userPreferences = new UserPreferences();
    userPreferences.userId = savedUser.id;
    // Default preferences will be set by entity defaults

    // Save related entities
    await this.userAuthRepository.save(userAuth);
    await this.userProfileRepository.save(userProfile);
    await this.userPreferencesRepository.save(userPreferences);

    // Return user without sensitive data
    const { auth, ...userWithoutAuth } = savedUser;
    return userWithoutAuth;
  }

  async createGoogleUser(userData: {
    fullName: string;
    email: string;
    picture: string;
    googleId: string;
  }): Promise<any> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ 
      where: { email: userData.email.toLowerCase() },
      relations: ['auth', 'profile', 'preferences']
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user with related entities
    const user = new User();
    user.fullName = userData.fullName;
    user.email = userData.email.toLowerCase();
    user.status = UserStatus.ACTIVE;
    user.role = UserRole.STUDENT;
    user.emailVerified = true;

    // Save user first to get the ID
    const savedUser = await this.userRepository.save(user);

    // Create related entities with the user ID
    const userAuth = new UserAuth();
    userAuth.id = savedUser.id;
    userAuth.googleId = userData.googleId;
    userAuth.loginAttempts = 0;

    const userProfile = new UserProfile();
    userProfile.id = savedUser.id;
    userProfile.picture = userData.picture;
    userProfile.preferences = {};
    userProfile.profile = {};

    const userPreferences = new UserPreferences();
    userPreferences.userId = savedUser.id;
    // Default preferences will be set by entity defaults

    // Save related entities
    await this.userAuthRepository.save(userAuth);
    await this.userProfileRepository.save(userProfile);
    await this.userPreferencesRepository.save(userPreferences);

    // Return user without sensitive data
    const { auth, ...userWithoutAuth } = savedUser;
    return userWithoutAuth;
  }

  async createWorkOSUser(userData: {
    email: string;
    fullName: string;
    workosId: string;
    emailVerified: boolean;
    profilePictureUrl?: string;
  }): Promise<any> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ 
      where: { email: userData.email.toLowerCase() },
      relations: ['auth', 'profile', 'preferences']
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user with related entities
    const user = new User();
    user.fullName = userData.fullName;
    user.email = userData.email.toLowerCase();
    user.status = UserStatus.ACTIVE;
    user.role = UserRole.STUDENT;
    user.emailVerified = userData.emailVerified;

    // Save user first to get the ID
    const savedUser = await this.userRepository.save(user);

    // Create related entities with the user ID
    const userAuth = new UserAuth();
    userAuth.id = savedUser.id;
    userAuth.workosId = userData.workosId;
    userAuth.loginAttempts = 0;

    const userProfile = new UserProfile();
    userProfile.id = savedUser.id;
    userProfile.picture = userData.profilePictureUrl;
    userProfile.preferences = {};
    userProfile.profile = {};

    const userPreferences = new UserPreferences();
    userPreferences.userId = savedUser.id;
    // Default preferences will be set by entity defaults

    // Save related entities
    await this.userAuthRepository.save(userAuth);
    await this.userProfileRepository.save(userProfile);
    await this.userPreferencesRepository.save(userPreferences);

    // Return user without sensitive data
    const { auth, ...userWithoutAuth } = savedUser;
    return userWithoutAuth;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ 
      where: { email: email.toLowerCase() },
      relations: ['auth', 'profile', 'preferences']
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ 
      where: { id },
      relations: ['auth', 'profile', 'preferences']
    });
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const isValid = await user.validatePassword(password);
    if (!isValid) return null;
    return user;
  }

  async updateUser(
    id: string,
    updates: Partial<Pick<User, 'fullName' | 'role' | 'status' | 'emailVerified'>>,
  ): Promise<Omit<User, 'password'>> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException('User not found');

    // Whitelist updatable fields to avoid accidental PK writes
    const allowedUpdates: Partial<Pick<User, 'fullName' | 'role' | 'status' | 'emailVerified'>> = {};
    if (typeof updates.fullName !== 'undefined') allowedUpdates.fullName = updates.fullName;
    if (typeof updates.role !== 'undefined') allowedUpdates.role = updates.role;
    if (typeof updates.status !== 'undefined') allowedUpdates.status = updates.status;
    if (typeof updates.emailVerified !== 'undefined') allowedUpdates.emailVerified = updates.emailVerified;

    await this.userRepository.update(id, allowedUpdates);
    const saved = await this.findById(id);
    if (!saved) throw new NotFoundException('User not found after update');
    const { auth, ...userWithoutAuth } = saved;
    return userWithoutAuth as Omit<User, 'password'>;
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.auth) {
      user.auth.password = newPassword; // Will be hashed by entity hook
      await this.userAuthRepository.save(user.auth);
    }
  }

  /**
   * Link Google account data to an existing user and update profile fields
   */
  async setGoogleData(userId: string, googleId: string, picture?: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Ensure related rows exist (they should, as created on user creation)
    if (!user.auth) {
      const auth = new UserAuth();
      auth.id = userId;
      user.auth = await this.userAuthRepository.save(auth);
    }
    if (!user.profile) {
      const profile = new UserProfile();
      profile.id = userId;
      profile.preferences = {} as any;
      profile.profile = {} as any;
      user.profile = await this.userProfileRepository.save(profile);
    }

    // Update Google fields
    user.auth.googleId = googleId;
    if (picture) {
      user.profile.picture = picture as any;
    }

    await this.userAuthRepository.save(user.auth);
    await this.userProfileRepository.save(user.profile);

    // Mark email as verified when Google is linked
    await this.userRepository.update(userId, { emailVerified: true });
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.find({
      relations: ['auth', 'profile', 'preferences']
    });
    return users.map(({ auth, ...user }) => user as Omit<User, 'password'>);
  }

  async getUserStats(): Promise<{ total: number; active: number; inactive: number }> {
    const users = await this.userRepository.find();
    return {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      inactive: users.filter(u => u.status !== 'active').length,
    };
  }

  /**
   * Ensure a user_preferences row exists for the user
   */
  async getOrCreateUserPreferences(userId: string): Promise<UserPreferences> {
    let prefs = await this.userPreferencesRepository.findOne({ where: { userId } });
    if (!prefs) {
      prefs = new UserPreferences();
      prefs.userId = userId;
      prefs.customPreferences = {} as any;
      prefs = await this.userPreferencesRepository.save(prefs);
    }
    return prefs;
  }

  /**
   * Get customize preferences used by the Customize Lucid dialog
   */
  async getCustomizePreferences(userId: string): Promise<{
    displayName?: string;
    occupation?: string;
    traits?: string;
    extraNotes?: string;
    preferredLanguage?: string;
  }> {
    // Prefer normalized table if present
    let row = await this.userCustomizationRepository.findOne({ where: { userId } });
    if (!row) {
      // Fallback to legacy JSON in user_preferences
      const prefs = await this.getOrCreateUserPreferences(userId);
      const custom = (prefs.customPreferences || {}) as Record<string, any>;
      return {
        displayName: custom.displayName,
        occupation: custom.occupation,
        traits: custom.traits,
        extraNotes: custom.extraNotes,
        preferredLanguage: custom.preferredLanguage ?? (prefs.language || 'English'),
      };
    }
    return {
      displayName: row.displayName ?? undefined,
      occupation: row.occupation ?? undefined,
      traits: row.traits ?? undefined,
      extraNotes: row.extraNotes ?? undefined,
      preferredLanguage: row.preferredLanguage ?? undefined,
    };
  }

  /**
   * Update customize preferences; leaves fields unchanged when not provided
   */
  async updateCustomizePreferences(userId: string, updates: {
    displayName?: string;
    occupation?: string;
    traits?: string;
    extraNotes?: string;
    preferredLanguage?: string;
  }): Promise<{
    displayName?: string;
    occupation?: string;
    traits?: string;
    extraNotes?: string;
    preferredLanguage?: string;
  }> {
    // Upsert into normalized table
    let row = await this.userCustomizationRepository.findOne({ where: { userId } });
    if (!row) {
      row = new UserCustomization();
      row.userId = userId;
    }
    if (typeof updates.displayName !== 'undefined') row.displayName = updates.displayName || null;
    if (typeof updates.occupation !== 'undefined') row.occupation = updates.occupation || null;
    if (typeof updates.traits !== 'undefined') row.traits = updates.traits || null;
    if (typeof updates.extraNotes !== 'undefined') row.extraNotes = updates.extraNotes || null;
    if (typeof updates.preferredLanguage !== 'undefined') row.preferredLanguage = updates.preferredLanguage || null;

    await this.userCustomizationRepository.save(row);

    // Mirror language to user_preferences.language if provided
    if (typeof updates.preferredLanguage !== 'undefined') {
      const prefs = await this.getOrCreateUserPreferences(userId);
      prefs.language = updates.preferredLanguage || prefs.language;
      await this.userPreferencesRepository.save(prefs);
    }

    return {
      displayName: row.displayName ?? undefined,
      occupation: row.occupation ?? undefined,
      traits: row.traits ?? undefined,
      extraNotes: row.extraNotes ?? undefined,
      preferredLanguage: row.preferredLanguage ?? undefined,
    };
  }
} 