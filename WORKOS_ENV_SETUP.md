# 🔧 WorkOS Environment Variables Setup

## ❌ **Current Error**
```
Error: Password string too short (min 32 characters required)
```

This error occurs because the `WORKOS_COOKIE_PASSWORD` environment variable is missing or too short.

## ✅ **Solution: Set Up Environment Variables**

### 1. **Create/Update your `.env` file in the `server/` directory**

Add these variables to your `server/.env` file:

```env
# WorkOS Configuration
WORKOS_API_KEY=sk_test_your_workos_api_key_here
WORKOS_CLIENT_ID=client_your_workos_client_id_here
WORKOS_COOKIE_PASSWORD=your_super_secure_cookie_password_at_least_32_chars_long
```

### 2. **Generate a Secure Cookie Password**

You need a cookie password that's **at least 32 characters long**. Here are some ways to generate one:

#### Option A: Use Node.js to generate a secure password
```bash
cd server
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Option B: Use an online generator
- Go to: https://www.random.org/strings/
- Generate a 32+ character random string

#### Option C: Example format only (do not copy real secrets into repo)
```
<32+ char random string here>
```

### 3. **Get Your WorkOS Credentials**

1. Go to [WorkOS Dashboard](https://dashboard.workos.com/)
2. Create a new application or select existing one
3. Go to "API Keys" section
4. Copy your **API Key** (starts with `sk_test_` or `sk_live_`)
5. Copy your **Client ID** (starts with `client_`)

### 4. **Example `.env` file**

```env
# WorkOS Configuration
WORKOS_API_KEY=YOUR_WORKOS_API_KEY
WORKOS_CLIENT_ID=YOUR_WORKOS_CLIENT_ID
WORKOS_COOKIE_PASSWORD=<32+ char random string>

# Your existing variables...
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
# ... other variables
```

### 5. **Restart Your Server**

After updating the `.env` file:

```bash
cd server
npm start
```

## 🔍 **Verification**

Once you've set up the environment variables correctly, you should see:

1. ✅ Server starts without WorkOS-related errors
2. ✅ Authentication flow works properly
3. ✅ No more "Password string too short" errors

## 🚨 **Important Security Notes**

- **Never commit your `.env` file to version control**
- **Use different API keys for development and production**
- **Keep your cookie password secure and unique**
- **Rotate your API keys regularly**

## 📝 **Next Steps**

After setting up the environment variables:

1. Restart your server
2. Test the authentication flow again
3. The "Continue with WorkOS" button should now work properly
4. You should be redirected to your WorkOS authentication screen 