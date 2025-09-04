import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { workosAuthService, WorkOSUser } from '../services/workosAuthService';

interface AuthContextType {
  user: WorkOSUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<WorkOSUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const { sessionToken } = workosAuthService.getStoredTokens();
      
      if (!sessionToken) {
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      const validation = await workosAuthService.validateSession(sessionToken);
      
      if (validation.valid && validation.user) {
        setUser(validation.user);
        setIsAuthenticated(true);
        
        // Update stored tokens if new ones were returned
        if (validation.accessToken) {
          workosAuthService.storeTokens(sessionToken, validation.accessToken);
        }
      } else {
        // Invalid session, clear tokens
        workosAuthService.clearTokens();
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
      workosAuthService.clearTokens();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      const { sessionToken } = workosAuthService.getStoredTokens();
      
      if (sessionToken) {
        const logoutUrl = await workosAuthService.logout(sessionToken, window.location.origin);
        workosAuthService.clearTokens();
        setUser(null);
        setIsAuthenticated(false);
        
        // Redirect to WorkOS logout URL
        window.location.href = logoutUrl;
      } else {
        // No session token, just clear local state
        workosAuthService.clearTokens();
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Even if logout fails, clear local state
      workosAuthService.clearTokens();
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
