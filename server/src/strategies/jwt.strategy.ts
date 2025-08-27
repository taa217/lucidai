import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key-change-in-production';
    console.log('🔍 Debug - JWT Strategy initialized with secret length:', jwtSecret.length);
    console.log('🔍 Debug - JWT Secret starts with:', jwtSecret.substring(0, 20) + '...');
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    try {
      console.log('🔍 Debug - JWT Strategy validate called with payload:', {
        sub: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        iat: payload.iat,
        exp: payload.exp,
      });
      
      // Passport-JWT has already validated the token, just return user info
      console.log('🔍 Debug - Token validation successful:', payload.sub);
      
      return {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
      };
    } catch (error) {
      console.error('🔍 Debug - JWT Strategy validation failed:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
} 