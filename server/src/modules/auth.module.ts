import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from '../controllers/auth.controller';
import { WorkOSAuthController } from '../controllers/workos-auth.controller';
import { AuthService } from '../services/auth.service';
import { WorkOSAuthService } from '../services/workos-auth.service';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { LocalStrategy } from '../strategies/local.strategy';
import { GoogleStrategy } from '../strategies/google.strategy';
import { UserService } from '../services/user.service';
import { User } from '../entities/user.entity';
import { UserAuth } from '../entities/user-auth.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { UserPreferences } from '../entities/user-preferences.entity';
import { UserCustomization } from '../entities/user-customization.entity';
import { MailService } from '../services/mail.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key-change-in-production',
        signOptions: { 
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([User, UserAuth, UserProfile, UserPreferences, UserCustomization]),
  ],
  controllers: [AuthController, WorkOSAuthController],
  providers: [AuthService, WorkOSAuthService, UserService, JwtStrategy, LocalStrategy, GoogleStrategy, MailService],
  exports: [AuthService, WorkOSAuthService, UserService, MailService],
})
export class AuthModule {} 