# AI Teacher Frontend Integration

This directory contains the frontend components for the AI Teacher interactive learning system.

## Components

### AITeacherSession.tsx
Main session component that handles:
- Session initialization and streaming
- Audio playback synchronization
- Visual content rendering
- Error handling and recovery
- User interaction controls

### CodeSlideRuntime.tsx
TSX code renderer that:
- Compiles AI-generated TSX code using Babel
- Provides React Native-compatible runtime environment
- Handles SVG primitives for diagrams
- Implements auto-fix error reporting
- Supports progressive content reveals

## Usage

```tsx
import { AITeacherSession } from '../components/ai-teacher/AITeacherSession'

<AITeacherSession
  topic="What is machine learning?"
  userId="user123"
  onComplete={() => console.log('Lesson completed')}
  onError={(error) => console.error('Teaching error:', error)}
/>
```

## Features

- **Real-time Streaming**: NDJSON streaming from AI Teacher backend
- **Dynamic TSX Rendering**: Compiles and renders AI-generated code
- **Audio Synchronization**: Voice narration with visual content
- **Error Recovery**: Automatic error reporting and fixes
- **Progressive Reveals**: Timeline-based content animation
- **Responsive Design**: Works on all screen sizes

## Dependencies

- `@babel/standalone` - For TSX compilation
- `framer-motion` - For animations
- `lucide-react` - For icons

## API Endpoints

The components integrate with these backend endpoints:
- `POST /api/agents/teacher/start` - Start new session
- `POST /api/agents/teacher/stream` - Stream lesson events
- `POST /api/agents/teacher/render-error` - Report render errors

## Error Handling

The system includes comprehensive error handling:
- Compilation errors are caught and reported
- Runtime errors trigger auto-fix attempts
- Network errors show user-friendly messages
- Audio playback errors are handled gracefully

## Testing

Use the `TestAITeacher.tsx` component to test the integration:

```tsx
import { TestAITeacher } from '../components/ai-teacher/TestAITeacher'

<TestAITeacher />
```

## Recent Fixes

- Fixed TypeScript errors with useRef initialization
- Added proper React 18 createRoot import
- Fixed optional chaining for event.speak properties
- Updated timeout ref types to handle undefined values
- **MAJOR FIX**: Updated API service to call Python teacher service directly on port 8003 instead of through NestJS server
- Simplified AITeacherSession to match backup implementation pattern
- Fixed streaming to use correct endpoints: `/teacher/start` and `/teacher/stream`

## Environment Configuration

Make sure to set the orchestrator URL in your environment:

```bash
REACT_APP_ORCHESTRATOR_URL=http://localhost:8003
```

The AI Teacher service runs on port 8003 (Python service) and should be started separately from the main NestJS server.
