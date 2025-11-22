import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { workosAuthService } from '../services/workosAuthService';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <svg
              className="animate-spin h-8 w-8 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to WorkOS custom login endpoint using runtime-safe redirect URI
    const redirectUri = workosAuthService.getRedirectUri();
    const loginUrl = `${workosAuthService.getBaseUrl()}/auth/workos/authorize?redirectUri=${encodeURIComponent(redirectUri)}`;
    
    // DEBUG: Pause redirect to show what's being generated
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white p-6 rounded-lg shadow-lg break-words">
          <h2 className="text-xl font-bold text-red-600 mb-4">Authentication Redirect Debug</h2>
          <div className="text-sm space-y-4">
             <div>
               <p className="font-semibold">Calculated Redirect URI:</p>
               <code className="block bg-gray-100 p-2 rounded mt-1">{redirectUri}</code>
             </div>
             <div>
               <p className="font-semibold">Full Login URL:</p>
               <code className="block bg-gray-100 p-2 rounded mt-1">{loginUrl}</code>
             </div>
             <div className="pt-4">
               <p className="text-gray-600 mb-2">Please check if the "Calculated Redirect URI" above matches EXACTLY what is in your WorkOS Dashboard.</p>
               <button 
                 onClick={() => window.location.href = loginUrl}
                 className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
               >
                 Proceed to Login
               </button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
