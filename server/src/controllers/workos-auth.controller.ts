import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Req,
  Res,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { WorkOSAuthService } from '../services/workos-auth.service';

@ApiTags('WorkOS Authentication')
@Controller('auth/workos')
export class WorkOSAuthController {
  constructor(private workosAuthService: WorkOSAuthService) {}

  @Get('authorize')
  @ApiOperation({ summary: 'Get WorkOS authorization URL and redirect' })
  @ApiQuery({ name: 'clientId', required: false, description: 'WorkOS Client ID' })
  @ApiQuery({ name: 'redirectUri', required: false, description: 'Redirect URI after authentication' })
  @ApiResponse({ status: 302, description: 'Redirects to WorkOS authorization URL' })
  async authorizeGet(
    @Query('clientId') clientId?: string,
    @Query('redirectUri') redirectUri?: string,
    @Res() res?: Response
  ) {
    try {
      // Use default values if not provided
      const finalClientId = clientId || this.workosAuthService.getClientId();
      const finalRedirectUri = redirectUri || 'http://localhost:8081/auth/callback';
      
      console.log('🔍 WorkOS - GET /authorize called with:', { finalClientId, finalRedirectUri });
      
      const authorizationUrl = await this.workosAuthService.getAuthorizationUrl({
        clientId: finalClientId,
        redirectUri: finalRedirectUri,
      });

      console.log('🔍 WorkOS - Redirecting to WorkOS:', authorizationUrl);

      // Always redirect to WorkOS authorization URL
      if (res) {
        // Set proper headers for redirect
        res.setHeader('Location', authorizationUrl);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.status(302).redirect(authorizationUrl);
      }
      
      return { authorizationUrl };
    } catch (error) {
      console.error('🔍 WorkOS - Error in GET /authorize:', error);
      throw new BadRequestException('Failed to generate authorization URL');
    }
  }

  @Post('authorize')
  @ApiOperation({ summary: 'Get WorkOS authorization URL' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        redirectUri: { type: 'string' },
      },
      required: ['clientId', 'redirectUri'],
    },
  })
  @ApiResponse({ status: 200, description: 'Authorization URL generated successfully' })
  async getAuthorizationUrl(@Body() body: { clientId: string; redirectUri: string }) {
    try {
      const { clientId, redirectUri } = body;
      
      if (!clientId || !redirectUri) {
        throw new BadRequestException('Client ID and redirect URI are required');
      }

      const authorizationUrl = await this.workosAuthService.getAuthorizationUrl({
        clientId,
        redirectUri,
      });

      return { authorizationUrl };
    } catch (error) {
      console.error('Error generating authorization URL:', error);
      throw new BadRequestException('Failed to generate authorization URL');
    }
  }

  @Post('callback')
  @ApiOperation({ summary: 'Handle WorkOS authentication callback' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        state: { type: 'string' },
        clientId: { type: 'string' },
        redirectUri: { type: 'string' },
      },
      required: ['code', 'clientId', 'redirectUri'],
    },
  })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  async handleCallback(@Body() body: { 
    code: string; 
    state?: string; 
    clientId: string; 
    redirectUri: string; 
  }) {
    try {
      const { code, state, clientId, redirectUri } = body;
      
      if (!code || !clientId || !redirectUri) {
        throw new BadRequestException('Code, client ID, and redirect URI are required');
      }

      const result = await this.workosAuthService.handleCallback({
        code,
        state,
        clientId,
        redirectUri,
      });

      return result;
    } catch (error) {
      console.error('Error handling auth callback:', error);
      throw new BadRequestException('Authentication callback failed');
    }
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate WorkOS session' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Session is valid' })
  @ApiResponse({ status: 401, description: 'Session is invalid' })
  async validateSession(@Req() req: Request) {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      
      if (!sessionToken) {
        throw new UnauthorizedException('No session token provided');
      }

      const isValid = await this.workosAuthService.validateSession(sessionToken);
      if (!isValid) {
        throw new UnauthorizedException('Invalid session');
      }

      // Also return API JWT for guarded endpoints
      const jwtBundle = await this.workosAuthService.getJwtForSession(sessionToken);
      if (jwtBundle) {
        return {
          valid: true,
          user: jwtBundle.user,
          accessToken: jwtBundle.accessToken,
          refreshToken: jwtBundle.refreshToken,
        };
      }
      return { valid: true };
    } catch (error) {
      console.error('Error validating session:', error);
      throw new UnauthorizedException('Session validation failed');
    }
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile from WorkOS session' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserProfile(@Req() req: Request) {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      
      if (!sessionToken) {
        throw new UnauthorizedException('No session token provided');
      }

      const user = await this.workosAuthService.getUserProfile(sessionToken);
      
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return user;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw new UnauthorizedException('Failed to get user profile');
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout user from WorkOS' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'returnTo', required: false, description: 'Optional return URL after WorkOS logout' })
  @ApiResponse({ status: 200, description: 'Returns a logoutUrl to redirect the browser to' })
  async logout(@Req() req: Request, @Query('returnTo') returnTo?: string) {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      if (!sessionToken) {
        throw new UnauthorizedException('No session token provided');
      }

      const logoutUrl = await this.workosAuthService.logout(sessionToken, returnTo);
      return { logoutUrl };
    } catch (error) {
      console.error('Error during logout:', error);
      throw new BadRequestException('Logout failed');
    }
  }

  @Get('test')
  @ApiOperation({ summary: 'Test WorkOS configuration' })
  @ApiResponse({ status: 200, description: 'WorkOS configuration test' })
  async testWorkOSConfig() {
    try {
      const clientId = this.workosAuthService.getClientId();
      
      // Test generating an authorization URL
      const testRedirectUri = 'http://localhost:8081/auth/callback';
      const authorizationUrl = await this.workosAuthService.getAuthorizationUrl({
        clientId,
        redirectUri: testRedirectUri,
      });

      return {
        success: true,
        clientId,
        testRedirectUri,
        authorizationUrl,
        message: 'WorkOS configuration is working correctly'
      };
    } catch (error) {
      console.error('🔍 WorkOS - Configuration test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'WorkOS configuration test failed'
      };
    }
  }
} 