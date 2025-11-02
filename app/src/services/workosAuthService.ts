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
  private allowedRedirectUris: string[];
  private normalizedAllowedRedirectUris: string[];
  private callbackPath: string;

  constructor() {
    this.clientId = process.env.REACT_APP_WORKOS_CLIENT_ID || '';
    this.baseUrl = this.resolveBaseUrl();
    this.callbackPath = this.normalizeCallbackPath(process.env.REACT_APP_WORKOS_CALLBACK_PATH);
    this.allowedRedirectUris = this.buildAllowedRedirectUris();
    this.normalizedAllowedRedirectUris = this.allowedRedirectUris.map((uri) => this.normalizeForComparison(uri));
    this.redirectUri = this.resolveRedirectUri();
    
    if (!this.clientId) {
      console.error('REACT_APP_WORKOS_CLIENT_ID is required');
    }
  }

  private getRuntimeOrigin(): string | null {
    if (typeof window === 'undefined' || !window.location?.origin) {
      return null;
    }
    return window.location.origin.replace(/\/+$/, '');
  }

  private isLocalhostOrigin(origin: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  }

  private normalizeBaseUrl(value: string, runtimeOrigin: string | null): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/\/+$/, '');
    }

    if (trimmed.startsWith('//')) {
      const protocol = runtimeOrigin?.startsWith('https://') ? 'https:' : 'http:';
      return `${protocol}${trimmed}`.replace(/\/+$/, '');
    }

    if (trimmed.startsWith('/')) {
      const normalizedPath = trimmed.replace(/\/+$/, '') || '/';
      if (runtimeOrigin) {
        return `${runtimeOrigin}${normalizedPath === '/' ? '' : normalizedPath}`;
      }
      return normalizedPath === '/' ? '' : normalizedPath;
    }

    if (runtimeOrigin) {
      return `${runtimeOrigin}/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`;
    }

    return `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  }

  private resolveBaseUrl(): string {
    const runtimeOrigin = this.getRuntimeOrigin();
    const envBaseCandidate =
      process.env.REACT_APP_WORKOS_BASE_URL || process.env.REACT_APP_API_BASE_URL || '';

    const envResolved = envBaseCandidate
      ? this.normalizeBaseUrl(envBaseCandidate, runtimeOrigin)
      : null;

    if (envResolved) {
      return envResolved;
    }

    if (runtimeOrigin && !this.isLocalhostOrigin(runtimeOrigin)) {
      return runtimeOrigin;
    }

    return 'http://localhost:3001';
  }

  private normalizeCallbackPath(path?: string): string {
    const value = (path && path.trim()) || '/auth/callback';
    if (!value.startsWith('/')) {
      return `/${value.replace(/^\/*/, '')}`;
    }
    return value.replace(/\/$/, '');
  }

  private buildAllowedRedirectUris(): string[] {
    const rawList = [
      process.env.REACT_APP_WORKOS_REDIRECT_URI,
      process.env.REACT_APP_WORKOS_ALLOWED_REDIRECT_URIS,
    ]
      .filter(Boolean)
      .join(',');

    return rawList
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private normalizeForComparison(uri: string): string {
    try {
      const parsed = new URL(uri);
      parsed.hash = '';
      // Remove trailing slash for comparison consistency
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      return parsed.toString();
    } catch (error) {
      console.warn('Invalid redirect URI encountered while normalizing:', uri, error);
      return uri.trim();
    }
  }

  private buildRuntimeRedirectUri(): string | null {
    if (typeof window === 'undefined' || !window.location?.origin) {
      return null;
    }
    const origin = window.location.origin.replace(/\/+$/, '');
    return `${origin}${this.callbackPath}`;
  }

  private resolveRedirectUri(): string {
    const runtimeRedirect = this.buildRuntimeRedirectUri();

    if (runtimeRedirect) {
      const runtimeMatches = this.normalizedAllowedRedirectUris.includes(
        this.normalizeForComparison(runtimeRedirect)
      );

      if (runtimeMatches || this.normalizedAllowedRedirectUris.length === 0) {
        return runtimeRedirect;
      }

      console.warn(
        '[WorkOS] Runtime redirect URI is not in the configured allow list. Falling back to first allowed URI.',
        {
          runtimeRedirect,
          allowedRedirectUris: this.allowedRedirectUris,
        }
      );
    }

    if (this.allowedRedirectUris.length > 0) {
      return this.allowedRedirectUris[0];
    }

    // Final fallback for development environments
    return 'http://localhost:3000/auth/callback';
  }

  getRedirectUri(): string {
    const runtimeRedirect = this.buildRuntimeRedirectUri();
    if (runtimeRedirect) {
      const runtimeNormalized = this.normalizeForComparison(runtimeRedirect);
      const currentNormalized = this.normalizeForComparison(this.redirectUri);

      const runtimeAllowed =
        this.normalizedAllowedRedirectUris.length === 0 ||
        this.normalizedAllowedRedirectUris.includes(runtimeNormalized);

      if (runtimeAllowed && runtimeNormalized !== currentNormalized) {
        this.redirectUri = runtimeRedirect;
      }
    }

    return this.redirectUri;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // Get authorization URL from backend
  async getAuthorizationUrl(): Promise<string> {
    try {
      const url = new URL(`${this.baseUrl}/auth/workos/authorize`);
      url.searchParams.set('redirectUri', this.getRedirectUri());
      
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
          redirectUri: this.getRedirectUri(),
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
