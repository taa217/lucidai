# Lucid Learn AI - Backend API

## Overview

This is the NestJS backend API for the Lucid Learn AI platform. It provides RESTful endpoints for interacting with AI educational agents and managing the learning experience.

## Features

- **AI Agent Integration**: Direct communication with Python-based AI services
- **Q&A Agent**: Educational question-answering capabilities
- **Health Monitoring**: Real-time service health checks
- **Swagger Documentation**: Interactive API documentation
- **Type-Safe Configuration**: Environment-based configuration management
- **Comprehensive Testing**: Unit and integration tests

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Python services running (see `../python_services/`)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file based on `env.example`:

```bash
cp env.example .env
```

Edit the `.env` file with your configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=3000

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:8081,http://localhost:19006

# Python AI Services Configuration
QNA_AGENT_URL=http://localhost:8001
QNA_AGENT_TIMEOUT=30000

# Logging
LOG_LEVEL=debug
```

### Running the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run start:prod

# Debug mode
npm run start:debug
```

The API will be available at:
- **API**: http://localhost:3000
- **Documentation**: http://localhost:3000/api/docs

## API Endpoints

### AI Agents

#### Ask Q&A Agent
```http
POST /api/agents/qna/ask
Content-Type: application/json

{
  "sessionId": "session_123",
  "userId": "user_456",
  "message": "What is the capital of France?",
  "conversationHistory": [],
  "preferredProvider": "openai",
  "context": {
    "subject": "geography"
  }
}
```

#### Health Checks
```http
GET /api/agents/health
GET /api/agents/qna/health
```

## Architecture

### Service Communication

```
Frontend (React Native/Expo)
         ↓
NestJS Backend API
         ↓
Python AI Services
```

### Key Components

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and external service communication
- **DTOs**: Data validation and transformation
- **Configuration**: Environment-based settings
- **Interceptors**: Request/response logging and error handling

### Error Handling

The API provides comprehensive error handling with appropriate HTTP status codes:

- `400`: Bad Request - Invalid input data
- `503`: Service Unavailable - AI services are down
- `500`: Internal Server Error - Unexpected errors

## Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Development

### Code Style

```bash
# Format code
npm run format

# Lint code
npm run lint
```

### Building

```bash
npm run build
```

## Integration with Python Services

This backend communicates with Python-based AI services. Ensure the following services are running:

1. **Q&A Agent Service** - Port 8000
   - Handles educational questions
   - Supports multiple LLM providers
   - Maintains conversation context

### Service Discovery

The backend automatically discovers and monitors Python services. Health checks ensure reliability and provide fallback mechanisms.

## Deployment

### Environment Variables

Required environment variables for production:

- `NODE_ENV=production`
- `PORT=3000`
- `QNA_AGENT_URL=https://your-qna-service.com`
- `CORS_ORIGINS=https://your-frontend.com`

### Docker

```bash
# Build image
docker build -t lucid-learn-api .

# Run container
docker run -p 3000:3000 --env-file .env lucid-learn-api
```

## Monitoring

### Health Checks

- `/api/agents/health` - Overall AI services health
- `/api/agents/qna/health` - Q&A agent specific health

### Logging

Structured logging with different levels:
- Development: `debug` level
- Production: `info` level

## Contributing

1. Follow TypeScript best practices
2. Write comprehensive tests
3. Update documentation
4. Use conventional commit messages

## API Documentation

Interactive API documentation is available at `/api/docs` when the server is running. This includes:

- Request/response schemas
- Example requests
- Authentication requirements
- Error response formats
