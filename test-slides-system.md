# Testing the Slide-Based Teaching System

## Quick Test (Without Backend Services)

1. **Start the React Native app:**
   ```bash
   cd app
   npm start
   ```

2. **Open on your device:**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on physical device

3. **Test the SlidePlayer:**
   - On the main screen, enter any learning goal (e.g., "Machine Learning")
   - Click the green **"Test Slide Player"** button
   - This will generate a mock slide deck and open the player

4. **Test SlidePlayer Features:**
   - ▶️ Play/Pause button to start/stop narration
   - ⏮️ ⏭️ Previous/Next buttons to navigate slides
   - 🔤 Caption toggle to show/hide speaker notes
   - ⚙️ Settings for playback speed and volume
   - 📚 Sources button to view citations (on slides that have them)

## Full System Test (With All Services)

### 1. Start Backend Services

**Terminal 1 - NestJS API Gateway:**
```bash
cd server
npm install
npm run start:dev
```

**Terminal 2 - Python Slide Generation Service:**
```bash
cd python_services
python -m venv venv
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python slide_generation_service/main.py
```

**Terminal 3 - Other Python Services (optional):**
```bash
cd python_services
python start_all_services.py
```

### 2. Test API Endpoints

**Test slide generation directly:**
```bash
curl -X POST http://localhost:3000/slides/generate \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user" \
  -d '{
    "learning_goal": "Introduction to Quantum Computing",
    "preferred_duration_minutes": 15,
    "difficulty_level": "beginner"
  }'
```

### 3. Test Full Flow in App

1. Make sure all services are running
2. In `InitialPrompt.tsx`, the `handleStartLearning` function should already be configured to call the API
3. Enter a learning goal and click the arrow button (not the test button)
4. This will:
   - Call the slide generation API
   - Use LangChain agents to research and create slides
   - Navigate to the SlidePlayer with the generated deck

## Troubleshooting

### Common Issues:

1. **"Failed to connect to slide generation service"**
   - Make sure Python service is running on port 8005
   - Check if you have all Python dependencies installed
   - Verify API keys in `.env` file

2. **Blank slides or missing content**
   - Check console for errors
   - Ensure all components are imported correctly
   - Verify TypeScript types match between frontend and backend

3. **Audio/Voice not working**
   - Voice synthesis is not yet fully integrated
   - Speaker notes will show as captions instead

### Environment Variables Needed:

Create `.env` files in:

**`server/.env`:**
```
SERVICE_HOST=localhost
```

**`python_services/.env`:**
```
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key_optional
SERVICE_HOST=localhost
```

## Features to Test:

- [x] Slide navigation (next/previous)
- [x] Multiple slide layouts (title, bullets, text+image)
- [x] Smooth animations (fade in, slide up, zoom)
- [x] Source citations display
- [x] Playback controls (play/pause, speed)
- [x] Caption toggle
- [x] Progress bar
- [x] Responsive design (phone/tablet)
- [ ] Voice narration (pending integration)
- [ ] Quiz interactions (pending implementation)
- [ ] Adaptive slide insertion (pending implementation)

## Next Steps:

1. **Voice Integration**: Connect to voice synthesis service
2. **Real Content**: Test with actual document uploads
3. **Interactions**: Implement quiz/feedback handling
4. **Performance**: Test with larger decks (20-50 slides) 