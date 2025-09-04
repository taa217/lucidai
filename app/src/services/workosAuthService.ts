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
  sessionToken: string;
  accessToken: string;
  refreshToken?: string;
}

class WorkOSAuthService {
  private clientId: string;
  private baseUrl: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.REACT_APP_WORKOS_CLIENT_ID || '';
    this.baseUrl = process.env.REACT_APP_WORKOS_BASE_URL || 'http://localhost:3001';
    this.redirectUri = process.env.REACT_APP_WORKOS_REDIRECT_URI || 'http://localhost:3000/auth/callback';
    
    if (!this.clientId) {
      console.error('REACT_APP_WORKOS_CLIENT_ID is required');
    }
  }

  // Get authorization URL from backend
  async getAuthorizationUrl(): Promise<string> {
    try {
      const url = new URL(`${this.baseUrl}/auth/workos/authorize`);
      url.searchParams.set('redirectUri', this.redirectUri);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const data = await response.json();
      return data.authorizationUrl;
    } catch (error) {
      console.error('Error getting authorization URL:', error);
      throw error;
    }
  }

  // Handle authentication callback
  async handleCallback(code: string, state?: string): Promise<WorkOSAuthResult> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/workos/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          state,
          clientId: this.clientId,
          redirectUri: this.redirectUri,
        }),
      });

      if (!response.ok) {
        throw new Error('Authentication callback failed');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error handling callback:', error);
      throw error;
    }
  }

  // Validate session
  async validateSession(sessionToken: string): Promise<{ valid: boolean; user?: WorkOSUser; accessToken?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/workos/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        return { valid: false };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error validating session:', error);
      return { valid: false };
    }
  }

  // Get user profile
  async getUserProfile(sessionToken: string): Promise<WorkOSUser | null> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/workos/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const user = await response.json();
      return user;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Logout
  async logout(sessionToken: string, returnTo?: string): Promise<string> {
    try {
      const url = new URL(`${this.baseUrl}/auth/workos/logout`);
      if (returnTo) {
        url.searchParams.set('returnTo', returnTo);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      const result = await response.json();
      return result.logoutUrl;
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  }

  // Test WorkOS configuration
  async testConfig(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/workos/test`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error testing WorkOS config:', error);
      return { success: false, message: 'Configuration test failed' };
    }
  }

  // Store tokens in localStorage
  storeTokens(sessionToken: string, accessToken: string, refreshToken?: string): void {
    localStorage.setItem('workos_session_token', sessionToken);
    localStorage.setItem('workos_access_token', accessToken);
    if (refreshToken) {
      localStorage.setItem('workos_refresh_token', refreshToken);
    }
  }

  // Get stored tokens
  getStoredTokens(): { sessionToken?: string; accessToken?: string; refreshToken?: string } {
    return {
      sessionToken: localStorage.getItem('workos_session_token') || undefined,
      accessToken: localStorage.getItem('workos_access_token') || undefined,
      refreshToken: localStorage.getItem('workos_refresh_token') || undefined,
    };
  }

  // Clear stored tokens
  clearTokens(): void {
    localStorage.removeItem('workos_session_token');
    localStorage.removeItem('workos_access_token');
    localStorage.removeItem('workos_refresh_token');
  }
}

export const workosAuthService = new WorkOSAuthService();
