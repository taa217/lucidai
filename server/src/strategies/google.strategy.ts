import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    
    // Only initialize if Google OAuth is properly configured
    if (!clientID || !clientSecret) {
      console.warn('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file');
      // Initialize with dummy values to prevent errors
      super({
        clientID: 'dummy',
        clientSecret: 'dummy',
        callbackURL: 'http://localhost:3001/auth/google/callback',
        scope: ['email', 'profile'],
      });
      return;
    }
    
    super({
      clientID,
      clientSecret,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:3001/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos } = profile;
    const user = {
      email: emails[0].value,
      fullName: name.givenName + ' ' + name.familyName,
      picture: photos[0].value,
      accessToken,
      googleId: profile.id,
    };
    
    try {
      // Find or create user in our database
      const existingUser = await this.authService.findOrCreateGoogleUser(user);
      done(null, existingUser || false);
    } catch (error) {
      done(error, undefined);
    }
  }
} 