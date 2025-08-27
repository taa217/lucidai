# Lucid Learn AI - Your Personal AI Teacher

**Vision:** To transform any document into a personalized, immersive learning experience with a voice-enabled AI teacher that instructs you in real-time.

**Status:** In Development - Building the foundation for a revolutionary learning platform.

This project is a state-of-the-art AI teaching platform where users upload their documents, define their learning goals, and receive personalized whiteboard-style lessons from a sophisticated multi-agent AI system. Our core focus is on a minimalist, distraction-free user experience, powered by cutting-edge AI and real-time voice synthesis to create a learning environment that is both effective and engaging.

## 🎯 Core Concept: The Future of Learning

Our vision is to make learning deeply personal and intuitive. The user journey is simple:

```
📚 Upload Documents → 🎯 Define Learning Goal → 🤖 AI Generates Lesson Plan → 🎙️ AI Teaches with Voice & Whiteboard
```

**How It Will Work:**

1.  **📥 Upload Any Source:** Users provide their learning materials—books, research papers, articles, etc.
2.  **🎯 Define Learning Goals:** Users state what they want to learn in their own words (e.g., "Explain the theory of relativity using this book").
3.  **🤖 AI Lesson Generation:** A multi-agent system analyzes the documents and crafts a bespoke curriculum tailored to the user's goals.
4.  **🎙️ Real-Time AI Teaching:** The AI teacher presents the lesson on a clean, digital whiteboard, speaking naturally while illustrating key concepts—just like a real tutor.

## 🎨 Design Philosophy: Minimalist, Intuitive, Beautiful

Inspired by the design ethos of Apple and OpenAI, our goal is to create an application that is not only powerful but also a joy to use.

-   **Zero Cognitive Load:** The interface will be clean, simple, and focused, removing all unnecessary distractions.
-   **Immersive Experience:** Full-screen, focused learning modes that help users dive deep into their subjects.
-   **Aesthetic & Responsive:** A beautiful, modern design that looks and feels great on any device, from a phone to a large display.
-   **World-Class UX:** Every interaction is designed to be smooth, intuitive, and natural.

## 🧠 Technology Stack & Architecture

We are building a robust and scalable platform using a modern, multi-service architecture.

-   **Frontend:** React Native (with Expo) for a unified codebase across iOS, Android, and the web.
-   **Backend Gateway:** NestJS for a reliable and efficient API gateway.
-   **AI Services:** Python-based microservices for specialized AI tasks.
-   **AI Orchestration:** **LangChain** to coordinate our multi-agent system.
-   **Language Models:** A flexible, multi-provider approach supporting:
    -   **OpenAI** (GPT-4 and other models)
    -   **Anthropic** (Claude series)
    -   **Google** (Gemini series)
-   **Voice Synthesis:** Multi-provider voice system with intelligent fallback:
    -   **Primary Provider:** **ElevenLabs** - Premium AI voices with natural expression and emotion
    -   **Secondary Provider:** **Azure Speech** - High-quality neural voices with SSML support
    -   **Fallback Provider:** **Google TTS (gTTS)** - Reliable basic text-to-speech for development

## 🚀 Development Roadmap: Building Our Vision

This is our step-by-step plan to bring the vision to life.

### **Phase 1: Foundation & Core UI (Current Focus)**

-   [x] Refine project vision and create a clear roadmap (this `README.md`).
-   [ ] **Design and implement the initial user interface:** A minimalist prompt for learning goals and document upload.
-   [ ] Set up and verify the basic project structure and dependencies for the frontend, backend, and Python services.

### **Phase 2: Core Teaching Loop (Text & Visuals)**

-   [ ] Implement the document upload pipeline and a basic document processing service.
-   [ ] Create a `Lesson Planning Agent` that generates a curriculum from user goals and uploaded content.
-   [ ] Develop the `Whiteboard Teaching` interface where the AI presents the lesson visually (text and simple diagrams).
-   [ ] Build the first end-to-end flow: User prompt → Lesson Plan → Text-based whiteboard teaching.

### **Phase 3: Enhanced Voice Integration (Current)**

-   [x] Create an enhanced `Voice Synthesis Service` with multi-provider support (ElevenLabs, Azure, gTTS).
-   [x] Implement intelligent provider fallback system for maximum reliability.
-   [x] Synchronize premium voice narration with content appearing on the whiteboard.
-   [x] Implement robust audio playback capabilities in the React Native app using `expo-av`.

### **Phase 4: Advanced Agents & User Experience**

-   [ ] Enhance the AI agents for deeper content understanding, dynamic teaching, and interactive Q&A.
-   [ ] Refine the UI/UX for a seamless and immersive learning experience.
-   [ ] Implement user session management and progress tracking.

### **Phase 4: Production-Ready Scalability & Advanced Features**

-   [ ] Enhance the AI agents for deeper content understanding, dynamic teaching, and interactive Q&A.
-   [ ] Refine the UI/UX for a seamless and immersive learning experience.
-   [ ] Implement user session management and progress tracking.
-   [ ] Conduct performance optimization and load testing to ensure the system is scalable and reliable for >10,000 users.
-   [ ] Prepare the full platform for production deployment.

## 📁 Target Architecture

The project is structured as a multi-service architecture to ensure separation of concerns and scalability.

```
Lucid/
├── 📱 app/                          # React Native Frontend
├── 🖥️ server/                      # Node.js NestJS Backend API Gateway
├── 🐍 python_services/             # Python AI Microservices
│   ├── 🤖 multi_agent_orchestrator/
│   ├── 📄 document_processor/
│   ├── 🎙️ voice_synthesis_service/
│   ├── 🎓 teaching_content_service/
│   ├── 💬 qna_agent_service/
│   └── 📚 shared/
├── 💾 storage/                     # File storage & vector DB
└── ...
```

---

*"Upload your materials. Define your goals. Let our AI teach you with the personalization of a private tutor and the clarity of a world-class instructor."*