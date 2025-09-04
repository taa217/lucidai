# Lucid Learning App

A modern, AI-powered learning platform with a ChatGPT-like interface for personalized education.

## Features

### 🎯 Learning Interface
- **Clean, Minimalist Design**: Inspired by ChatGPT's user-friendly interface
- **Centered Learning Input**: Large input field with "What do you want to learn?" prompt
- **Voice Input Ready**: Microphone and audio input buttons for voice interaction
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### 🧭 Navigation
- **Learn**: Main learning interface (home page)
- **Documents**: Upload and manage study materials
- **Chat History**: Review previous learning conversations
- **Favorites**: Access saved learning resources
- **Settings**: Customize your learning experience

## Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation
```bash
cd app
npm install
```

### Development
```bash
npm start
```

The app will open at `http://localhost:3000`

### Building for Production
```bash
npm run build
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── LearningSidebar.tsx    # Main navigation sidebar
│   └── ProtectedRoute.tsx     # Authentication wrapper
├── layouts/            # Page layout components
│   └── LearningLayout.tsx     # Main app layout
├── pages/              # Page components
│   ├── LearningInterface.tsx  # Main learning page
│   ├── PlaceholderPage.tsx    # Placeholder for future features
│   └── AuthCallback.tsx       # OAuth callback handler
├── contexts/           # React contexts
│   └── AuthContext.tsx        # Authentication state
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── styles/             # CSS and styling
```

## Technology Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Routing**: React Router DOM
- **Build Tool**: Create React App

## Design Principles

- **Simplicity**: Clean, uncluttered interface focused on learning
- **Accessibility**: Keyboard navigation and screen reader support
- **Responsiveness**: Works perfectly on all device sizes
- **Performance**: Fast loading and smooth animations
- **User Experience**: Intuitive navigation and clear visual hierarchy

## Contributing

1. Follow the existing code structure and patterns
2. Keep components small and focused on single responsibilities
3. Use TypeScript for all new code
4. Follow the established naming conventions
5. Test your changes thoroughly

## Next Steps

The current interface provides the foundation for:
- AI-powered learning conversations
- Document management system
- Learning progress tracking
- Voice input and audio responses
- Real-time collaborative learning

## Support

For questions or issues, please refer to the main project documentation or create an issue in the repository.
