# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for the Lucid Learn AI application.

## Prerequisites

1. A Google account
2. Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable billing (required for OAuth)

## Step 2: Enable Required APIs

1. Go to "APIs & Services" > "Library"
2. Search for and enable the following APIs:
   - Google+ API
   - Google OAuth2 API

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type
3. Fill in the required information:
   - App name: "Lucid Learn AI"
   - User support email: Your email
   - Developer contact information: Your email
4. Add scopes:
   - `openid`
   - `profile`
   - `email`
5. Add test users (your email addresses)

## Step 4: Create OAuth 2.0 Client IDs

### Web Application
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application"
4. Name: "Lucid Learn AI Web"
5. Add authorized redirect URIs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3001/auth/google/callback`
6. Copy the Client ID

### iOS Application
1. Click "Create Credentials" > "OAuth 2.0 Client IDs"
2. Choose "iOS"
3. Name: "Lucid Learn AI iOS"
4. Bundle ID: `com.lucidlearn.app` (or your actual bundle ID)
5. Copy the Client ID

### Android Application
1. Click "Create Credentials" > "OAuth 2.0 Client IDs"
2. Choose "Android"
3. Name: "Lucid Learn AI Android"
4. Package name: `com.lucidlearn.app` (or your actual package name)
5. SHA-1 certificate fingerprint: (get this from your Android keystore)
6. Copy the Client ID

## Step 5: Update Configuration

1. Open `app/config/googleAuth.ts`
2. Replace the placeholder client IDs with your actual client IDs:

```typescript
export const GOOGLE_OAUTH_CONFIG = {
  webClientId: 'YOUR_ACTUAL_WEB_CLIENT_ID',
  iosClientId: 'YOUR_ACTUAL_IOS_CLIENT_ID',
  androidClientId: 'YOUR_ACTUAL_ANDROID_CLIENT_ID',
  // ... rest of config
};
```

## Step 6: Update Backend Environment Variables

1. Open `server/.env` (create if it doesn't exist)
2. Add the following variables:

```env
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
FRONTEND_URL=http://localhost:3000
```

## Step 7: Update App Configuration

### For iOS (app.json)
Add the following to your app.json:

```json
{
  "expo": {
    "scheme": "lucid",
    "ios": {
      "bundleIdentifier": "com.lucidlearn.app"
    }
  }
}
```

### For Android (app.json)
Add the following to your app.json:

```json
{
  "expo": {
    "scheme": "lucid",
    "android": {
      "package": "com.lucidlearn.app"
    }
  }
}
```

## Step 8: Test the Setup

1. Start your backend server: `cd server && npm run start:dev`
2. Start your frontend: `cd app && npm start`
3. Try signing in with Google
4. Check the browser console and server logs for any errors

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI" error**
   - Make sure the redirect URIs in Google Cloud Console match exactly
   - Check that your app scheme is correctly configured

2. **"Client ID not found" error**
   - Verify that you're using the correct client ID for each platform
   - Make sure the client IDs are properly set in the configuration

3. **"OAuth consent screen not configured" error**
   - Complete the OAuth consent screen setup
   - Add your email as a test user

4. **Backend connection issues**
   - Ensure your backend server is running
   - Check that the backend URL in the configuration is correct

### Getting SHA-1 Certificate Fingerprint (Android)

For development:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

For production, use your release keystore.

## Security Notes

1. Never commit your client secrets to version control
2. Use environment variables for sensitive configuration
3. Regularly rotate your OAuth credentials
4. Monitor your OAuth usage in Google Cloud Console

## Next Steps

Once Google OAuth is working:

1. Implement proper error handling
2. Add user profile management
3. Implement token refresh logic
4. Add logout functionality
5. Consider adding other OAuth providers (GitHub, Microsoft, etc.) 