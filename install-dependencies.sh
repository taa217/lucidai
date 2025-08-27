#!/bin/bash

echo "🚀 Installing Lucid Learn AI Dependencies..."

# Frontend dependencies
echo "📱 Installing Frontend Dependencies..."
npm install

# Install additional Expo dependencies
echo "📦 Installing Additional Expo Dependencies..."
npx expo install expo-document-picker
npx expo install expo-file-system  
npx expo install react-native-gesture-handler
npx expo install react-native-reanimated
npx expo install react-native-safe-area-context
npx expo install react-native-screens
npx expo install @react-native-async-storage/async-storage

# Backend dependencies
echo "🐍 Installing Backend Dependencies..."
cd python_services
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "✅ All dependencies installed successfully!"
echo ""
echo "🚀 To start the application:"
echo "1. Start backend services: cd python_services && python start_all_services.py"
echo "2. Start frontend: npm start" 