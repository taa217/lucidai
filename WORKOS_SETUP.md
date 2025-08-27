# WorkOS AuthKit Integration Setup Guide

This guide will help you set up WorkOS AuthKit authentication for the Lucid app, replacing the current authentication system.

## Prerequisites

1. A WorkOS account (sign up at [workos.com](https://workos.com))
2. Node.js and npm installed
3. The Lucid app codebase

## Step 1: WorkOS Dashboard Configuration

### 1.1 Create a WorkOS Application

1. Log in to your [WorkOS Dashboard](https://dashboard.workos.com)
2. Navigate to "Applications" in the left sidebar
3. Click "Add Application"
4. Fill in the application details:
   - **Name**: Lucid Learn
   - **Description**: AI-Powered Learning Platform
   - **Application Type**: Web Application

### 1.2 Configure Redirect URIs

1. In your WorkOS application settings, go to the "Redirects" section
2. Add the following redirect URIs:
   - **Redirect URI**: `http://localhost:8081/auth/callback` (for web app)
   - **Login Endpoint**: `http://localhost:3001/auth/workos/login` (for backend)
   - **Logout Redirect**: `http://localhost:8081/auth/logout` (for web app)

### 1.3 Get Your Credentials

1. Copy your **Client ID** from the application settings
2. Go to "API Keys" section and copy your **API Key**
3. Generate a **Cookie Password** (32 characters) using:
   ```bash
   openssl rand -base64 32
   ```

## Step 2: Backend Configuration

### 2.1 Install WorkOS SDK

The WorkOS Node.js SDK has already been installed. If not, run:
```bash
cd server
npm install @workos-inc/node
```

### 2.2 Environment Variables

Create a `.env` file in the `server` directory with the following variables:

```env
# WorkOS Configuration
WORKOS_API_KEY=sk_test_your_workos_api_key_here
WORKOS_CLIENT_ID=client_your_workos_client_id_here
WORKOS_COOKIE_PASSWORD=your_32_character_cookie_password_here

# Other existing variables...
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=lucid_learn
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
```

### 2.3 Backend Files Created

The following files have been created for WorkOS integration:

- `server/src/controllers/workos-auth.controller.ts` - WorkOS authentication endpoints
- `server/src/services/workos-auth.service.ts` - WorkOS authentication service
- `server/src/config/workos.config.ts` - WorkOS configuration

### 2.4 Update Auth Module

The `server/src/modules/auth.module.ts` has been updated to include WorkOS services.

## Step 3: Frontend Configuration

### 3.1 Environment Variables

Create a `.env` file in the `app` directory with the following variables:

```env
# WorkOS Configuration
EXPO_PUBLIC_WORKOS_CLIENT_ID=client_your_workos_client_id_here
EXPO_PUBLIC_WORKOS_BASE_URL=http://localhost:3001
EXPO_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:8081/auth/callback
```

### 3.2 Frontend Files Created

The following files have been created for WorkOS integration:

- `app/services/workosAuth.ts` - WorkOS authentication service for React Native
- `app/components/auth/WorkOSAuthScreen.tsx` - WorkOS authentication UI
- `app/components/auth/WorkOSAuthWrapper.tsx` - WorkOS authentication wrapper

### 3.3 Updated Files

The following files have been updated to use WorkOS:

- `app/app/_layout.tsx` - Updated to use WorkOS authentication
- `app/app/auth/index.tsx` - Updated to use WorkOS auth screen

## Step 4: Deep Linking Configuration

### 4.1 Update app.json

Add the following to your `app/app.json` file in the `expo` section:

```json
{
  "expo": {
    "scheme": "lucid",
    "ios": {
      "bundleIdentifier": "com.yourcompany.lucid"
    },
    "android": {
      "package": "com.yourcompany.lucid"
    }
  }
}
```

### 4.2 Configure Deep Links

The app is configured to handle the following deep links:
- `lucid://auth/callback` - Authentication callback
- `lucid://auth/logout` - Logout redirect

## Step 5: Testing the Integration

### 5.1 Start the Backend

```bash
cd server
npm run start:dev
```

### 5.2 Start the Frontend

```bash
cd app
npm start
```

### 5.3 Test Authentication Flow

1. Open the app on your device/simulator
2. You should see the WorkOS authentication screen
3. Click "Continue with WorkOS"
4. You'll be redirected to the WorkOS hosted authentication page
5. Complete the authentication process
6. You should be redirected back to the app and logged in

## Step 6: Custom UI Configuration (Optional)

Since you mentioned you've created a custom UI on WorkOS:

### 6.1 Configure Custom UI

1. In your WorkOS Dashboard, go to "Branding"
2. Upload your custom logo and configure colors
3. Customize the authentication flow appearance
4. Test the custom UI in the preview

### 6.2 Update Colors

The WorkOS auth screen uses your app's color scheme:
- Primary: `#2196F3` (your logo color)
- Secondary: `#1976D2`
- Background gradient: `#2196F3` to `#1976D2`

## Step 7: Production Deployment

### 7.1 Update Environment Variables

For production, update the environment variables:

```env
# Production WorkOS Configuration
WORKOS_API_KEY=sk_live_your_production_api_key
WORKOS_CLIENT_ID=client_your_production_client_id
WORKOS_COOKIE_PASSWORD=your_production_cookie_password

# Update redirect URIs for production
EXPO_PUBLIC_WORKOS_REDIRECT_URI=https://yourdomain.com/auth/callback
```

### 7.2 Update WorkOS Dashboard

1. Add production redirect URIs to your WorkOS application
2. Update the login and logout endpoints for production
3. Test the production authentication flow

## Troubleshooting

### Common Issues

1. **"Failed to get authorization URL"**
   - Check that your WorkOS API key and client ID are correct
   - Verify the backend is running on the correct port

2. **"Authentication callback failed"**
   - Ensure the redirect URI matches exactly in WorkOS dashboard
   - Check that the backend callback endpoint is working

3. **"No session token provided"**
   - Verify the cookie password is 32 characters long
   - Check that the session is being stored correctly

4. **Deep linking not working**
   - Ensure the scheme is configured correctly in app.json
   - Test deep links on both iOS and Android

### Debug Information

You can get debug information from the WorkOS auth service:

```javascript
// In your React Native app
import { workosAuthService } from './services/workosAuth';
console.log(workosAuthService.getDebugInfo());
```

## Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **Cookie Password**: Use a strong, random 32-character password
3. **HTTPS**: Always use HTTPS in production
4. **Session Management**: Sessions are automatically encrypted by WorkOS
5. **Token Storage**: Tokens are stored securely in AsyncStorage

## Next Steps

1. Test the authentication flow thoroughly
2. Customize the UI to match your brand
3. Set up user profile management
4. Configure additional WorkOS features (SSO, MFA, etc.)
5. Deploy to production

## Support

- [WorkOS Documentation](https://workos.com/docs)
- [WorkOS AuthKit Guide](https://workos.com/docs/authkit/vanilla/nodejs/2-add-authkit-to-your-app/redirect-users-to-authkit)
- [WorkOS Support](https://workos.com/support)

---

**Note**: This integration replaces the existing authentication system. Make sure to test thoroughly before deploying to production. 