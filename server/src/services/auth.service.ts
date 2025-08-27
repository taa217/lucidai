import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { LoginDto, RegisterDto, RefreshTokenDto, ChangePasswordDto } from '../dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { MailService } from './mail.service';

interface JwtPayload {
  sub: string;
  email: string;
  fullName: string;
}

interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private refreshTokens: Map<string, RefreshToken> = new Map();

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    return this.userService.validateUser(email, password);
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        birthday: user.birthday,
        usagePurpose: user.usagePurpose,
        userType: user.userType,
        createdAt: user.createdAt,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    // Validate password confirmation
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Create user
    const user = await this.userService.createUser({
      fullName: registerDto.fullName,
      email: registerDto.email,
      password: registerDto.password,
      birthday: registerDto.birthday ? new Date(registerDto.birthday) : undefined,
      usagePurpose: registerDto.usagePurpose,
      userType: registerDto.userType,
    });

    // Send verification email
    if (user.emailVerificationCode) {
      await this.mailService.sendVerificationEmail(user.email, user.emailVerificationCode);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user as User);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        birthday: user.birthday,
        usagePurpose: user.usagePurpose,
        userType: user.userType,
        createdAt: user.createdAt,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const refreshToken = this.refreshTokens.get(refreshTokenDto.refreshToken);
    
    if (!refreshToken || refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userService.findById(refreshToken.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(user);
    
    // Remove old refresh token
    this.refreshTokens.delete(refreshTokenDto.refreshToken);
    
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        birthday: user.birthday,
        usagePurpose: user.usagePurpose,
        userType: user.userType,
        createdAt: user.createdAt,
      },
    };
  }

  async logout(refreshToken: string) {
    this.refreshTokens.delete(refreshToken);
    return { message: 'Logged out successfully' };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Validate current password
    if (!user.password) {
      throw new UnauthorizedException('User has no password set (Google OAuth user)');
    }
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate new password confirmation
    if (changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword) {
      throw new BadRequestException('New passwords do not match');
    }

    // Update password
    await this.userService.updatePassword(userId, changePasswordDto.newPassword);

    // Invalidate all refresh tokens for this user
    for (const [token, refreshToken] of this.refreshTokens.entries()) {
      if (refreshToken.userId === userId) {
        this.refreshTokens.delete(token);
      }
    }

    return { message: 'Password changed successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateProfile(userId: string, updates: Partial<Pick<User, 'fullName' | 'preferences'>>) {
    return this.userService.updateUser(userId, updates);
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.emailVerified) return { message: 'Email already verified' };
    if (!user.emailVerificationCode || !user.emailVerificationExpires) throw new UnauthorizedException('No verification code set');
    if (user.emailVerificationExpires < new Date()) throw new UnauthorizedException('Verification code expired');
    if (user.emailVerificationCode !== code) throw new UnauthorizedException('Invalid verification code');
    user.emailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await this.userService["userRepository"].save(user); // Direct save for now
    return { message: 'Email verified successfully' };
  }

  async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: refreshToken.token,
    };
  }

  private async createRefreshToken(userId: string): Promise<RefreshToken> {
    const refreshToken: RefreshToken = {
      id: uuidv4(),
      userId,
      token: uuidv4(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: new Date(),
    };

    this.refreshTokens.set(refreshToken.token, refreshToken);
    return refreshToken;
  }

  async validateToken(token: string): Promise<JwtPayload> {
    try {
      console.log('🔍 Debug - AuthService validateToken called with token length:', token.length);
      const result = this.jwtService.verify(token);
      console.log('🔍 Debug - Token verification successful:', result.sub);
      return result;
    } catch (error) {
      console.error('🔍 Debug - Token verification failed:', error.message);
      throw new UnauthorizedException('Invalid token');
    }
  }

  async findOrCreateGoogleUser(googleUser: {
    email: string;
    fullName: string;
    picture: string;
    googleId: string;
  }) {
    let user = await this.userService.findByEmail(googleUser.email);
    
    if (!user) {
      // Create new user with Google OAuth data
      user = await this.userService.createGoogleUser({
        email: googleUser.email,
        fullName: googleUser.fullName,
        picture: googleUser.picture,
        googleId: googleUser.googleId,
      });
    } else {
      // Update existing user with Google OAuth data if not already set
      if (!user.googleId) {
        await this.userService.setGoogleData(
          user.id,
          googleUser.googleId,
          googleUser.picture,
        );
      }
    }
    
    return user;
  }

  // Clean up expired refresh tokens (should be called periodically)
  cleanupExpiredTokens() {
    const now = new Date();
    for (const [token, refreshToken] of this.refreshTokens.entries()) {
      if (refreshToken.expiresAt < now) {
        this.refreshTokens.delete(token);
      }
    }
  }
} 