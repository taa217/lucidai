import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkOS } from '@workos-inc/node';
import { UserService } from './user.service';
import { AuthService } from './auth.service';

export interface WorkOSUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  profilePictureUrl?: string;
  organizationId?: string;
  organizationName?: string;
  metadata?: Record<string, any>;
}

export interface WorkOSAuthResult {
  user: WorkOSUser;
  sessionToken: string; // WorkOS sealed session for profile/management
  accessToken: string;  // Our API JWT for guarded endpoints
  refreshToken?: string;
}

@Injectable()
export class WorkOSAuthService {
  private workos: WorkOS;
  private apiKey: string;
  private cookiePassword: string;
  private clientId: string;

  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private authService: AuthService,
  ) {
    const apiKey = this.configService.get<string>('WORKOS_API_KEY');
    const cookiePassword = this.configService.get<string>('WORKOS_COOKIE_PASSWORD');
    const clientId = this.configService.get<string>('WORKOS_CLIENT_ID');
    
    if (!apiKey) {
      throw new Error('WORKOS_API_KEY is required');
    }
    
    if (!cookiePassword) {
      throw new Error('WORKOS_COOKIE_PASSWORD is required');
    }

    if (!clientId) {
      throw new Error('WORKOS_CLIENT_ID is required');
    }

    this.apiKey = apiKey;
    this.cookiePassword = cookiePassword;
    this.clientId = clientId;
    // Pass clientId when initializing the SDK (required by session helpers)
    this.workos = new WorkOS(this.apiKey, { clientId: this.clientId });
  }

  getClientId(): string {
    return this.clientId;
  }

  async getAuthorizationUrl(params: { clientId: string; redirectUri: string }): Promise<string> {
    try {
      const { clientId, redirectUri } = params;
      
      console.log('🔍 WorkOS - Generating authorization URL with:', { clientId, redirectUri });
      
      // Use the correct WorkOS authorization URL generation with required provider
      const authorizationUrl = this.workos.userManagement.getAuthorizationUrl({
        clientId,
        redirectUri,
        state: this.generateState(),
        provider: 'authkit', // Required parameter for WorkOS AuthKit
      });

      console.log('🔍 WorkOS - Generated authorization URL:', authorizationUrl);
      return authorizationUrl;
    } catch (error) {
      console.error('🔍 WorkOS - Error generating authorization URL:', error);
      throw new Error('Failed to generate authorization URL');
    }
  }

  async handleCallback(params: { 
    code: string; 
    state?: string; 
    clientId: string; 
    redirectUri: string; 
  }): Promise<WorkOSAuthResult> {
    try {
      const { code, state, clientId, redirectUri } = params;

      // Authenticate with WorkOS using the authorization code
      const authenticateResponse = await this.workos.userManagement.authenticateWithCode({
        clientId,
        code,
        session: {
          sealSession: true,
          cookiePassword: this.cookiePassword,
        },
      });

      const { user, sealedSession } = authenticateResponse;

      // Convert WorkOS user to our format
      const workOSUser: WorkOSUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        fullName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.firstName || user.lastName || user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profilePictureUrl: user.profilePictureUrl || undefined,
        organizationId: (user as any).organizationId || undefined,
        organizationName: (user as any).organizationName || undefined,
        metadata: user.metadata,
      };

      // Store or update user in our database
      const dbUser = await this.findOrCreateWorkOSUser(workOSUser);

      // Issue our own API JWT for guarded endpoints
      const tokens = await this.authService.generateTokens({
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName || dbUser.email,
      } as any);

      return {
        user: dbUser,
        sessionToken: sealedSession || '',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      console.error('Error handling auth callback:', error);
      throw new Error('Authentication callback failed');
    }
  }

  async validateSession(sessionToken: string): Promise<boolean> {
    try {
      // Load the sealed session
      const session = this.workos.userManagement.loadSealedSession({
        sessionData: sessionToken,
        cookiePassword: this.cookiePassword,
      });

      // Authenticate the session
      const authResult = await session.authenticate();
      
      if (!authResult.authenticated) {
        // Try to refresh the session
        const refreshResult = await session.refresh();
        return refreshResult.authenticated;
      }

      return true;
    } catch (error) {
      console.error('Error validating session:', error);
      return false;
    }
  }

  async getJwtForSession(sessionToken: string): Promise<{
    user: WorkOSUser;
    accessToken: string;
    refreshToken: string;
  } | null> {
    try {
      const session = this.workos.userManagement.loadSealedSession({
        sessionData: sessionToken,
        cookiePassword: this.cookiePassword,
      });
      const authResult = await session.authenticate();
      if (!authResult.authenticated || !authResult.user) {
        return null;
      }
      const user = authResult.user;
      const workOSUser: WorkOSUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        fullName: user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.firstName || user.lastName || user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profilePictureUrl: user.profilePictureUrl || undefined,
        organizationId: (user as any).organizationId || undefined,
        organizationName: (user as any).organizationName || undefined,
        metadata: user.metadata,
      };
      const dbUser = await this.findOrCreateWorkOSUser(workOSUser);
      const tokens = await this.authService.generateTokens({
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName || dbUser.email,
      } as any);
      return {
        user: dbUser,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      console.error('Error exchanging session for JWT:', error);
      return null;
    }
  }

  async getUserProfile(sessionToken: string): Promise<WorkOSUser | null> {
    try {
      // Load the sealed session
      const session = this.workos.userManagement.loadSealedSession({
        sessionData: sessionToken,
        cookiePassword: this.cookiePassword,
      });

      // Authenticate the session
      const authResult = await session.authenticate();
      
      if (!authResult.authenticated || !authResult.user) {
        return null;
      }
      
      const user = authResult.user;

      // Convert WorkOS user to our format
      const workOSUser: WorkOSUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        fullName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.firstName || user.lastName || user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profilePictureUrl: user.profilePictureUrl || undefined,
        organizationId: (user as any).organizationId || undefined,
        organizationName: (user as any).organizationName || undefined,
        metadata: user.metadata,
      };

      // Try to find the user in our database
      const dbUser = await this.userService.findByEmail(workOSUser.email);
      if (dbUser) {
        // Return database user with WorkOS profile picture
        return {
          id: dbUser.id,
          email: dbUser.email,
          fullName: dbUser.fullName,
          emailVerified: dbUser.emailVerified,
          createdAt: dbUser.createdAt.toISOString(),
          updatedAt: dbUser.updatedAt.toISOString(),
          profilePictureUrl: workOSUser.profilePictureUrl,
          organizationId: workOSUser.organizationId,
          organizationName: workOSUser.organizationName,
          metadata: workOSUser.metadata,
        };
      }

      return workOSUser;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  async logout(sessionToken: string, returnTo?: string): Promise<string | null> {
    try {
      const session = this.workos.userManagement.loadSealedSession({
        sessionData: sessionToken,
        cookiePassword: this.cookiePassword,
      });

      // Ask WorkOS for the logout URL (this clears their session cookies)
      let logoutUrl: string;
      try {
        // Some SDK versions support passing { returnTo }
        logoutUrl = await (session as any).getLogoutUrl(
          returnTo ? { returnTo } : undefined
        );
      } catch (e) {
        // Fallback without options if SDK signature differs
        logoutUrl = await (session as any).getLogoutUrl();
      }

      console.log('🔍 WorkOS - Logout URL:', logoutUrl);
      return logoutUrl || null;
    } catch (error) {
      console.error('Error during logout:', error);
      return null;
    }
  }

  private generateState(): string {
    // Generate a random state parameter for security
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private async findOrCreateWorkOSUser(workOSUser: WorkOSUser): Promise<WorkOSUser> {
    try {
      // Check if user already exists in our database
      let existingUser = await this.userService.findByEmail(workOSUser.email);
      
      if (existingUser) {
        // Update existing user with WorkOS data
        const updatedUser = await this.userService.updateUser(existingUser.id, {
          fullName: workOSUser.fullName || existingUser.fullName,
          emailVerified: workOSUser.emailVerified,
        });
        
        // Update the auth record with WorkOS ID if not already set
        if (existingUser.auth && !existingUser.auth.workosId) {
          existingUser.auth.workosId = workOSUser.id;
          await this.userService['userAuthRepository'].save(existingUser.auth);
        }
        
        // Convert back to WorkOSUser format for consistency
        return {
          id: updatedUser.id,
          email: updatedUser.email,
          fullName: updatedUser.fullName,
          emailVerified: updatedUser.emailVerified,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
          profilePictureUrl: workOSUser.profilePictureUrl,
          organizationId: workOSUser.organizationId,
          organizationName: workOSUser.organizationName,
          metadata: workOSUser.metadata,
        };
      } else {
        // Create new user in our database
        const newUser = await this.userService.createWorkOSUser({
          email: workOSUser.email,
          fullName: workOSUser.fullName || workOSUser.email,
          workosId: workOSUser.id,
          emailVerified: workOSUser.emailVerified,
          profilePictureUrl: workOSUser.profilePictureUrl,
        });
        
        // Convert to WorkOSUser format
        return {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          emailVerified: newUser.emailVerified,
          createdAt: newUser.createdAt.toISOString(),
          updatedAt: newUser.updatedAt.toISOString(),
          profilePictureUrl: workOSUser.profilePictureUrl,
          organizationId: workOSUser.organizationId,
          organizationName: workOSUser.organizationName,
          metadata: workOSUser.metadata,
        };
      }
    } catch (error) {
      console.error('Error finding or creating WorkOS user:', error);
      // Return the original WorkOS user if database operations fail
      return workOSUser;
    }
  }
} 