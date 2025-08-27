import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ChangePasswordDto,
  AuthResponseDto,
} from '../dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth() {
    // This will be handled by the Google OAuth strategy
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    if (!user) {
      return res.redirect('/auth/google/failure');
    }

    const tokens = await this.authService.generateTokens(user);
    
    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
    return res.redirect(redirectUrl);
  }

  @Get('google/failure')
  @ApiOperation({ summary: 'Google OAuth failure' })
  async googleAuthFailure(@Res() res: Response) {
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=Google authentication failed`;
    return res.redirect(redirectUrl);
  }

  @Post('google/process')
  @ApiOperation({ summary: 'Process Google OAuth data from frontend' })
  async processGoogleAuth(@Body() body: { googleUser: any; googleTokens: any }) {
    const { googleUser, googleTokens } = body;
    
    // Find or create user
    const user = await this.authService.findOrCreateGoogleUser({
      email: googleUser.email,
      fullName: googleUser.fullName,
      picture: googleUser.picture,
      googleId: googleUser.id,
    });

    if (!user) {
      throw new BadRequestException('Failed to create or find user');
    }

    // Generate tokens
    const tokens = await this.authService.generateTokens(user);
    
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        picture: user.picture,
        createdAt: user.createdAt,
      },
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User logout' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @Post('verify-email')
  async verifyEmail(@Body() body: { email: string; code: string }) {
    return this.authService.verifyEmail(body.email, body.code);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user profile' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.userId);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updates: { fullName?: string; preferences?: any },
  ) {
    return this.authService.updateProfile(user.userId, updates);
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change user password' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, changePasswordDto);
  }

  @Get('health')
  @ApiOperation({ summary: 'Authentication service health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck() {
    return {
      status: 'healthy',
      service: 'authentication',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('customize')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Customize Lucid preferences for current user' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Preferences retrieved' })
  async getCustomize(@CurrentUser() user: any) {
    return this.userService.getCustomizePreferences(user.id);
  }

  @Put('customize')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update Customize Lucid preferences for current user' })
  @ApiBearerAuth()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        displayName: { type: 'string', nullable: true },
        occupation: { type: 'string', nullable: true },
        traits: { type: 'string', nullable: true },
        extraNotes: { type: 'string', nullable: true },
        preferredLanguage: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Preferences updated' })
  async putCustomize(@CurrentUser() user: any, @Body() body: any) {
    return this.userService.updateCustomizePreferences(user.id, body || {});
  }

  @Get('demo-credentials')
  @ApiOperation({ summary: 'Get demo credentials for testing' })
  @ApiResponse({ status: 200, description: 'Demo credentials' })
  async getDemoCredentials() {
    return {
      email: 'demo@lucid.ai',
      password: 'demo123',
      note: 'These are demo credentials for testing purposes only',
    };
  }
} 