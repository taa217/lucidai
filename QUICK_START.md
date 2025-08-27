# 🚀 Lucid Learn AI - Quick Start Guide

Get your AI learning platform running in minutes!

## Prerequisites
- Node.js 18+ installed
- Python 3.8+ installed
- Expo CLI: `npm install -g @expo/cli`

## Step 1: Python AI Services (Terminal 1)
```bash
cd python_services

# Windows
venv\Scripts\activate

# Mac/Linux  
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment (add your API keys)
copy env.example .env
# Edit .env file with your OpenAI/Anthropic API keys

# Start the AI service
python start_qna_service.py
```
✅ Service running on http://localhost:8001

## Step 2: Backend API (Terminal 2)
```bash
cd server

# Install dependencies
npm install

# Start development server
npm run start:dev
```
✅ API running on http://localhost:3001
✅ Swagger docs at http://localhost:3001/api

## Step 3: Frontend App (Terminal 3)
```bash
cd app

# Install dependencies
npm install

# Install gradient dependency
npx expo install expo-linear-gradient

# Start Expo
npm start
```
✅ Choose your platform:
- Press `i` for iOS simulator
- Press `a` for Android emulator  
- Press `w` for web browser
- Scan QR code with Expo Go app

## Step 4: Test the System
1. **Health Check**: App automatically checks AI service health
2. **Ask Questions**: Try "Explain quantum physics" or "Help me with calculus"
3. **Explore Features**: Switch between Chat, Progress, and Status tabs

## 🎉 You're Ready to Learn!

The AI tutor is now ready to help you learn anything. The system includes:
- **Beautiful chat interface** with message bubbles
- **Real-time health monitoring** 
- **Multi-LLM support** with fallback
- **Learning analytics** and progress tracking
- **Dark/light theme** support

## Need Help?
- Check the main README.md for detailed documentation
- Ensure all services are running before testing
- Check console logs for any error messages

**Happy Learning! 🧠✨** 