# 🛠️ Quick Fix Guide - Resolve Current Issues

## Issue 1: Python Service Import Fixed ✅
I've already fixed the relative import issue in the Python service.

## Issue 2: NestJS Dependency Conflict Fixed ✅
I've updated the server package.json with compatible versions.

## Issue 3: Environment Setup for Python Services

You need to set up your `.env` file with API keys. Here's how:

### Step 1: Create .env file for Python services
```bash
cd python_services
copy env.example .env
```

### Step 2: Edit the .env file
Open `python_services/.env` and add your API keys:

```env
# At minimum, add one of these API keys:
OPENAI_API_KEY=sk-your-openai-key-here
# OR
ANTHROPIC_API_KEY=your-anthropic-key-here

# Service Configuration (keep these as-is)
SERVICE_NAME=qna-agent
SERVICE_PORT=8001
DEBUG=true
LOG_LEVEL=INFO
```

**⚠️ Important**: Change `SERVICE_PORT=8001` (not 8000) to match our frontend configuration.

## Now Try Again:

### Terminal 1: Python Services
```bash
cd python_services
venv\Scripts\activate
python start_qna_service.py
```

### Terminal 2: NestJS Backend
```bash
cd server
# Delete node_modules and package-lock to force clean install
rmdir /s node_modules
del package-lock.json
npm install
npm run start:dev
```

### Terminal 3: Frontend
```bash
cd app
npm start
```

## If You Don't Have API Keys Yet:

**For testing without API keys:**
1. The Python service will start but show warnings
2. The frontend will connect and show "service unavailable" 
3. You can still test the beautiful UI and health monitoring

**To get API keys:**
- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/

## Expected Results:
- ✅ Python service starts on http://localhost:8000
- ✅ NestJS API starts on http://localhost:3001  
- ✅ Expo app loads with beautiful Learning Dashboard
- ✅ Health monitoring shows service status
- ✅ Chat interface ready (needs API keys for AI responses)

Let me know if you hit any other issues! 🚀 