# Lucid Learn AI: Personalized Multi-Agent Learning Platform

## About The Project

Lucid Learn AI is an advanced, multi-agent learning platform designed to provide students with a highly personalized and interactive educational experience. The system aims to replicate the dynamics of a real teacher-student interaction through:

*   **AI Tutors:** Intelligent agents that deliver lessons, explain concepts, and adapt to individual student learning styles and pace. These tutors leverage multiple cutting-edge Large Language Models (LLMs) to provide diverse and robust pedagogical approaches.
*   **Real-time Voice Interaction:** Students can ask questions and interact with the AI tutor using natural voice. The AI tutor will also respond in a natural, conversational voice, powered by state-of-the-art speech synthesis (e.g., Sesame CSM), ensuring low-latency, engaging dialogue.
*   **Interactive Whiteboard:** The AI tutor will use a shared digital whiteboard to illustrate concepts, write notes, and solve problems, similar to how a teacher uses a blackboard. Students can also interact with the whiteboard, making learning a collaborative process.
*   **Multi-Agent System:** The backend will consist of multiple specialized AI agents (e.g., teaching agent, Q&A agent, curriculum personalization agent, student progress tracking agent) orchestrating the learning experience. These agents will intelligently route tasks and synthesize information from various LLM APIs (OpenAI, Google, Anthropic) to deliver a comprehensive and tailored educational journey.
*   **Cross-Platform Access:** The platform will be accessible via a mobile application (iOS & Android) and a web application, built using Expo for a unified development experience and broad reach.

The core goal is to create a scalable, reliable, and highly performant production-ready system that offers a superior and engaging learning experience, going beyond traditional e-learning by fostering genuine understanding and curiosity.

## Project Structure (Current)

```
/LUCID/
├── app/                      # Expo (React Native) frontend. Initialized with JS template; migration to TypeScript planned.
│   ├── assets/               # Static assets (images, fonts)
│   ├── components/           # Reusable UI components
│   ├── navigations/          # Navigation logic (e.g., React Navigation)
│   ├── screens/              # Top-level screen components
│   ├── services/             # API clients, WebSocket manager, voice services
│   ├── store/                # State management (e.g., Redux, Zustand)
│   ├── App.tsx               # Main App component (or .js)
│   └── package.json
│
├── server/                   # Backend (Node.js/NestJS) for Primary API Gateway & Real-time Services
│   ├── src/
│   │   ├── main.ts           # (or main.py) Entry point
│   │   ├── config/           # Configuration files
│   │   ├── modules/          # Core feature modules (e.g., auth, users, learning_sessions)
│   │   │   ├── agents/       # Orchestration logic for AI agents (communicates with python_services)
│   │   │   ├── voice/        # Voice stream processing & STT/TTS orchestration (may call python_services for advanced TTS)
│   │   │   ├── whiteboard/   # Real-time whiteboard synchronization logic
│   │   │   └── llm_integrations/ # Connectors for orchestrating calls if some simple LLM tasks are handled here
│   │   ├── core/             # Shared core functionalities (e.g., database, websockets)
│   │   └── common/           # Common utilities, decorators, etc.
│   ├── Dockerfile
│   ├── package.json          # (or requirements.txt)
│   └── tsconfig.json         # (if using TypeScript)
│
├── python_services/          # Python/FastAPI AI/ML Microservices. Each service will have its own virtual environment.
│   └── (Example: qna_agent_service/) # Placeholder for individual FastAPI services
│
├── shared/                   # (Optional) Shared code/types between frontend and backend
│   └── types/
│
├── docs/                     # Project documentation
│   └── ADR/                  # Architecture Decision Records
│
├── .gitignore
├── README.md
└── docker-compose.yml        # (Optional) For local development environment
```

## Core Technologies

*   **Frontend:**
    *   React Native
    *   Expo (for cross-platform development and web)
    *   TypeScript
    *   State Management (e.g., Zustand, Redux Toolkit)
    *   Real-time Communication: WebSockets (e.g., Socket.IO client)
*   **Backend (Hybrid Approach):**
    *   **Primary API Gateway & Real-time Services (Node.js):**
        *   Framework: NestJS with TypeScript
        *   Responsibilities: Client-facing APIs, user management, WebSocket communication (voice/whiteboard), orchestration.
    *   **AI/ML Microservices (Python):**
        *   Framework: FastAPI
        *   Responsibilities: Core AI agent logic, NLP, personalization algorithms, LLM interactions, potential advanced voice processing.
    *   Database: PostgreSQL (or similar robust SQL DB)
    *   Caching: Redis
    *   Real-time Communication: WebSockets (e.g., Socket.IO, or native WebSocket support in NestJS/FastAPI)
*   **AI & Voice:**
    *   Large Language Models: OpenAI API, Google AI Platform APIs, Anthropic API
    *   Text-to-Speech (TTS): Sesame CSM (deployed via Cerebrium, DeepInfra, or self-hosted)
    *   Speech-to-Text (STT): Browser-based APIs, or cloud services (Google Speech-to-Text, AWS Transcribe)
*   **Infrastructure & Deployment:**
    *   Cloud Provider (e.g., AWS, GCP, Azure)
    *   Docker
    *   Kubernetes (for scaling, optional for initial stages)
    *   CI/CD (e.g., GitHub Actions, GitLab CI)

## Key Features Roadmap (Illustrative)

1.  **Foundation & Core Setup:**
    *   Initial project scaffolding (Expo, Backend framework).
    *   Basic user authentication and profile management.
    *   Setup WebSocket communication channel.
2.  **Voice Interaction - Proof of Concept:**
    *   Integrate STT for student input (client-side or basic backend processing).
    *   Deploy Sesame CSM (e.g., via Cerebrium) and integrate for AI tutor voice output.
    *   Basic voice request -> AI text response -> AI voice output loop.
3.  **Interactive Whiteboard - Proof of Concept:**
    *   Basic whiteboard UI on the client.
    *   Real-time synchronization of simple drawing actions via WebSockets.
4.  **First Agent Implementation (e.g., Q&A Agent):**
    *   Backend logic for a simple agent to receive text (from STT).
    *   Integrate with one LLM API to generate a text response.
    *   Route LLM response to TTS and display on whiteboard.
5.  **Personalization Engine - V1:**
    *   Store student interaction history.
    *   Basic adaptation of teaching style or content based on history.
6.  **Multi-Agent Orchestration:**
    *   Develop framework for multiple agents to collaborate.
    *   Define communication protocols between agents.
7.  **Advanced Features & Scaling:**
    *   Complex teaching scenarios and curriculum integration.
    *   Sophisticated personalization algorithms.
    *   Robust error handling, monitoring, and logging.
    *   Load testing and performance optimization.
    *   Comprehensive UI/UX refinement.

## Getting Started (High-Level Next Steps)

1.  **Setup Development Environment:**
    *   Install Node.js, npm/yarn, Python (if chosen for backend).
    *   Install Expo CLI: `npm install -g expo-cli`
    *   Install Docker & Docker Compose (recommended for local services like DB/Redis).
2.  **Version Control & Python Env Setup:**
    *   Initialize a Git repository.
    *   Create a root `.gitignore` file.
    *   Set up Python virtual environments for services within `python_services/`.
    *   Make the initial commit.
3.  **Task Management:** Set up a project board (e.g., GitHub Projects, Jira, Trello) to track tasks.
4.  **Begin with PoCs:** Start building out the proof-of-concept features (Voice, Whiteboard) to validate core technologies and identify challenges early.

## Contribution

Details on how to contribute to the project will be added here as the project matures (e.g., coding standards, pull request process).

---

This is a living document and will be updated as the project evolves. 