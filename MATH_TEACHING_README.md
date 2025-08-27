# 🎓 Lucid Math Teaching System

A revolutionary AI-powered mathematics education platform that provides **fundamentals-first** instruction with visual whiteboard teaching and voice explanations.

## 🌟 Key Features

### 📚 **Fundamentals-First Approach**
- **Never assumes prior knowledge** - starts from absolute basics
- Builds concepts step-by-step with careful progression
- Checks understanding at each stage before advancing
- Provides encouraging, patient instruction

### 🎯 **Visual + Audio Teaching**
- **Interactive whiteboard** with step-by-step math notation
- **AI voice narration** synchronized with visual content
- Real-time writing and explanation of mathematical concepts
- Enhanced mathematical symbol rendering

### 🧠 **AI-Powered Instruction**
- **Multiple specialized agents**:
  - **Fundamentals Teacher**: Patient, encouraging basic concept instruction
  - **Problem Solver**: Step-by-step solution methodology
  - **Concept Builder**: Deep understanding through connections
- **Anthropic Claude** for educational content generation
- **OpenAI GPT** for structured problem solving

### 📈 **Adaptive Learning**
- **Four difficulty levels**: Fundamentals, Basic, Intermediate, Advanced
- **Prerequisite checking** ensures proper learning sequence
- **Personalized pace** adjustment (slow, moderate, fast)
- **Smart board management** with unlimited content flow

### 🎨 **Modern User Experience**
- **Beautiful, distraction-free interface**
- **Responsive design** for all screen sizes
- **Dark/light mode** support
- **Immersive teaching mode** for focused learning

## 📖 Available Math Topics

### 🧮 **Arithmetic Fundamentals**
- Counting and numbers
- Addition and subtraction
- Multiplication and division
- Fractions basics
- Decimals and percentages

### 🔢 **Algebra**
- Variables and expressions
- Linear equations
- Quadratic equations
- Systems of equations
- Polynomials and factoring

### 📐 **Geometry**
- Basic shapes
- Area and perimeter
- Triangles and angles
- Circles
- Volume and surface area
- Coordinate geometry

### 📊 **Trigonometry**
- Angles and radians
- Right triangle trigonometry
- Unit circle
- Trigonometric functions
- Identities and equations

### 📈 **Calculus**
- Limits
- Derivatives basics
- Differentiation rules
- Applications of derivatives
- Integrals basics
- Integration techniques

## 🚀 Getting Started

### Prerequisites

1. **Python 3.8+** installed
2. **Node.js 16+** for the frontend
3. **API Keys** for AI providers:
   - OpenAI API key
   - Anthropic API key
   
### Setup Instructions

1. **Clone and setup the environment**:
   ```bash
   cd python_services
   python setup_env.py
   ```

2. **Configure your API keys** in the `.env` file:
   ```env
   OPENAI_API_KEY=your_openai_key_here
   ANTHROPIC_API_KEY=your_anthropic_key_here
   ```

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the backend services**:
   ```bash
   python start_all_services.py
   ```

5. **Start the frontend** (in a new terminal):
   ```bash
   cd app
   npm install
   npm start
   ```

6. **Access the app**:
   - **Web**: http://localhost:8081
   - **Mobile**: Use Expo Go app with QR code

## 🎯 How to Use

### 1. **Choose Your Level**
- **Fundamentals**: Start from absolute basics
- **Basic**: Some knowledge assumed
- **Intermediate**: Comfortable with basics
- **Advanced**: Ready for complex concepts

### 2. **Select Math Topics**
- Choose one or more topics to learn
- System checks prerequisites automatically
- Topics are unlocked based on your level

### 3. **Start Learning**
- AI generates personalized lesson plans
- Follow step-by-step visual instruction
- Listen to voice explanations
- Progress at your own pace

### 4. **Interactive Teaching**
- Watch math appear on the whiteboard
- Listen to detailed explanations
- See concepts build progressively
- Experience unlimited content flow

## 🏗️ System Architecture

### Backend Services (Python)
- **Math Teaching Service** (Port 8004): Specialized math instruction
- **Multi-Agent Orchestrator** (Port 8003): AI agent coordination
- **Document Processor** (Port 8002): File processing (legacy)
- **Voice Synthesis** (Port 8005): Audio generation

### Frontend (React Native + Expo)
- **Math Topic Selector**: Choose learning goals
- **Whiteboard Teaching**: Visual instruction interface
- **Voice Integration**: Synchronized audio
- **Progress Tracking**: Learning analytics

### AI Models
- **Anthropic Claude-3**: Educational content generation
- **OpenAI GPT-4**: Problem solving and explanations
- **Fallback System**: Works even when services are offline

## 🔧 Configuration

### Service Ports
- Frontend: 8081
- Math Teaching: 8004
- Multi-Agent Orchestrator: 8003
- Document Processor: 8002
- Voice Synthesis: 8005

### Environment Variables
```env
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
SERVICE_HOST=localhost
MATH_TEACHING_PORT=8004
```

## 📱 Platform Support

- ✅ **Web browsers** (Chrome, Firefox, Safari)
- ✅ **iOS** (via Expo Go or built app)
- ✅ **Android** (via Expo Go or built app)
- ✅ **Cross-platform responsive design**

## 🎨 Design Philosophy

### Educational Principles
- **Patience over speed**: Take time to build understanding
- **Visual learning**: Show, don't just tell
- **Incremental progress**: Small steps lead to big achievements
- **Positive reinforcement**: Encourage at every step
- **No assumptions**: Start from what the student knows

### Technical Principles
- **Reliability**: Works even when AI services are offline
- **Performance**: Optimized for smooth interactions
- **Accessibility**: Designed for all learners
- **Scalability**: Ready for 10,000+ concurrent users

## 🔍 Troubleshooting

### Common Issues

1. **Services won't start**:
   ```bash
   # Check if ports are available
   netstat -an | findstr 8004
   
   # Restart services
   python start_all_services.py
   ```

2. **AI not responding**:
   - Check API keys in `.env` file
   - Verify internet connection
   - System will use fallback content

3. **Voice not working**:
   - Check browser permissions
   - Verify voice synthesis service is running
   - Toggle voice setting in app

4. **App not loading**:
   - Check frontend is running on port 8081
   - Verify backend services are healthy
   - Check network connectivity

### Health Checks
- Backend: http://localhost:8004/health
- API Docs: http://localhost:8004/docs
- Service Status: Check terminal output

## 🚀 Deployment

### Development
```bash
python start_all_services.py  # Backend
npm start                     # Frontend
```

### Production
- Deploy backend services to cloud infrastructure
- Build frontend for web or mobile app stores
- Configure production API endpoints
- Set up proper monitoring and logging

## 🤝 Contributing

This system is designed for educational excellence. Contributions should focus on:
- **Improving pedagogical approaches**
- **Enhancing user experience**
- **Adding new math topics**
- **Optimizing performance**
- **Fixing bugs**

## 📄 License

This project is built for educational purposes with a focus on making mathematics accessible to everyone.

---

**🎓 Built with passion for mathematics education**

*Empowering learners to build strong mathematical foundations through AI-powered, patient, step-by-step instruction.* 