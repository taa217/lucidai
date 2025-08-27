# 🔍 WorkOS Authentication Debug Guide

## 🚨 **Current Issue**
The authentication is bypassing WorkOS entirely and not showing your custom login UI. This means no real authentication is happening.

## 🔧 **Step-by-Step Debugging**

### 1. **Test Backend Configuration**

Visit this URL in your browser to test if WorkOS is configured correctly:
```
http://localhost:3001/auth/workos/test
```

**Expected Response:**
```json
{
  "success": true,
  "clientId": "client_...",
  "testRedirectUri": "http://localhost:8081/auth/callback",
  "authorizationUrl": "https://workos.com/authorize?...",
  "message": "WorkOS configuration is working correctly"
}
```

**If you get an error:**
- Check your environment variables
- Verify your WorkOS API key and client ID
- Make sure the backend is running

### 2. **Test Authorization URL Generation**

Visit this URL to see what authorization URL is generated:
```
http://localhost:3001/auth/workos/authorize?clientId=YOUR_CLIENT_ID&redirectUri=http://localhost:8081/auth/callback
```

**Expected Behavior:**
- Should redirect you to `https://workos.com/authorize?...`
- You should see your custom WorkOS login UI
- After login, should redirect back to `http://localhost:8081/auth/callback`

**If it doesn't redirect to WorkOS:**
- Check the backend logs for errors
- Verify your WorkOS dashboard configuration

### 3. **Check Backend Logs**

When you start the backend, look for these messages:
```
🔍 WorkOS - Service initialized with: { clientId: ..., baseUrl: ..., redirectUri: ... }
```

When you visit the authorization URL, look for:
```
🔍 WorkOS - GET /authorize called with: { finalClientId: ..., finalRedirectUri: ... }
🔍 WorkOS - Generating authorization URL with: { clientId: ..., redirectUri: ... }
🔍 WorkOS - Generated authorization URL: https://workos.com/authorize?...
🔍 WorkOS - Redirecting to WorkOS: https://workos.com/authorize?...
```

### 4. **Check Frontend Logs**

In the browser console (F12), look for:
```
🔍 WorkOS - Service initialized with: { clientId: ..., baseUrl: ..., redirectUri: ... }
🔍 WorkOS - Starting login flow...
🔍 WorkOS - Redirecting to: http://localhost:3001/auth/workos/authorize?...
```

### 5. **Verify WorkOS Dashboard Settings**

In your WorkOS Dashboard, make sure:

**Application Settings:**
- ✅ **Client ID**: Matches your environment variable
- ✅ **API Key**: Matches your environment variable

**Redirect URIs:**
- ✅ `http://localhost:8081/auth/callback`

**Login Endpoint:**
- ✅ `http://localhost:3001/auth/workos/authorize`

**Custom UI:**
- ✅ **Branding**: Your custom colors and logo are set
- ✅ **Authentication Flow**: Configured for your needs

### 6. **Environment Variables Check**

**Backend (`server/.env`):**
```env
WORKOS_API_KEY=sk_test_your_actual_key_here
WORKOS_CLIENT_ID=client_your_actual_id_here
WORKOS_COOKIE_PASSWORD=your_32_character_password_here
```

**Frontend (`app/.env`):**
```env
EXPO_PUBLIC_WORKOS_CLIENT_ID=client_your_actual_id_here
EXPO_PUBLIC_WORKOS_BASE_URL=http://localhost:3001
EXPO_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:8081/auth/callback
```

## 🎯 **Expected Authentication Flow**

1. **User clicks "Continue with WorkOS"**
   - Frontend redirects to: `http://localhost:3001/auth/workos/authorize`

2. **Backend processes authorization request**
   - Generates WorkOS authorization URL
   - Redirects to: `https://workos.com/authorize?...`

3. **User sees WorkOS login UI**
   - Your custom branding and colors
   - Login form or SSO options

4. **User completes authentication**
   - WorkOS redirects to: `http://localhost:8081/auth/callback?code=...`

5. **Frontend processes callback**
   - Exchanges code for tokens
   - Stores session
   - Redirects to main app

## 🚨 **Common Issues & Solutions**

### Issue 1: "No authorization code received"
- **Cause**: WorkOS not redirecting properly
- **Solution**: Check redirect URI in WorkOS dashboard

### Issue 2: "Failed to generate authorization URL"
- **Cause**: Invalid WorkOS credentials
- **Solution**: Verify API key and client ID

### Issue 3: "Password string too short"
- **Cause**: Cookie password too short
- **Solution**: Generate 32+ character password

### Issue 4: No WorkOS login UI shown
- **Cause**: Authorization URL not redirecting to WorkOS
- **Solution**: Check backend logs and WorkOS configuration

## 🔍 **Debug Commands**

### Generate Secure Cookie Password:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Test Backend Health:
```bash
curl http://localhost:3001/health
```

### Test WorkOS Configuration:
```bash
curl http://localhost:3001/auth/workos/test
```

## 📞 **Next Steps**

1. **Run the test endpoint** and share the results
2. **Check backend logs** when you visit the authorization URL
3. **Verify WorkOS dashboard** settings match exactly
4. **Test the authorization flow** step by step

Let me know what you find from these tests! 🔍 