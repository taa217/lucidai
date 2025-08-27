# Lucid Learn AI - Python Services

This directory contains the AI/ML microservices for the Lucid Learn AI platform. Each service is built with FastAPI and handles specific AI agent functionality.

## Services Overview

### 🤖 Q&A Agent Service (`qna_agent_service/`)
**Purpose**: Intelligent question and answer agent for educational interactions.

**Features**:
- Educational explanations with Socratic method
- Multi-LLM provider support (OpenAI, Anthropic)
- Conversation context awareness
- Adaptive difficulty based on student level
- Production-ready with comprehensive error handling

**Endpoints**:
- `POST /ask` - Process a single question
- `POST /batch-ask` - Process multiple questions in batch
- `GET /health` - Health check
- `GET /providers` - List available LLM providers

## Architecture

```
python_services/
├── shared/                    # Shared utilities and models
│   ├── __init__.py
│   ├── config.py             # Configuration management
│   ├── models.py             # Pydantic models for API
│   └── llm_client.py         # Unified LLM client
├── qna_agent_service/        # Q&A Agent microservice
│   ├── __init__.py
│   ├── main.py               # FastAPI application
│   ├── agent.py              # Core agent logic
│   └── test_agent.py         # Test script
├── venv/                     # Python virtual environment
├── requirements.txt          # Python dependencies
├── env.example               # Environment configuration template
└── README.md                 # This file
```

## Setup & Installation

### 1. Prerequisites
- Python 3.8+ 
- Virtual environment activated
- API keys for LLM providers

### 2. Environment Configuration
```bash
# Copy the example environment file
cp env.example .env

# Edit .env with your API keys
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Install Dependencies
```bash
# Make sure virtual environment is activated
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

## Running Services

### Q&A Agent Service

#### Development Mode
```bash
cd qna_agent_service
python main.py
```

#### Production Mode
```bash
cd qna_agent_service
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

#### Using Custom Port
```bash
# Set environment variable
export SERVICE_PORT=8000

# Or run directly
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Testing

### Test Individual Agent
```bash
cd qna_agent_service
python test_agent.py
```

### Test API Endpoints
```bash
# Install httpx for testing
pip install httpx

# Test health endpoint
curl http://localhost:8000/health

# Test question endpoint
curl -X POST "http://localhost:8000/ask" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session",
    "user_id": "test-user",
    "message": "What is photosynthesis?",
    "context": {"subject": "Biology", "grade_level": "8th grade"}
  }'
```

## API Usage Examples

### Single Question
```python
import httpx
import asyncio

async def ask_question():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/ask",
            json={
                "session_id": "demo-session",
                "user_id": "student-123",
                "message": "How do I solve quadratic equations?",
                "context": {
                    "subject": "Math",
                    "grade_level": "High School",
                    "difficulty_preference": "intermediate"
                }
            }
        )
        return response.json()

# Run
result = asyncio.run(ask_question())
print(result["response"])
```

### Conversation with Context
```python
import httpx

# Conversation history
conversation_history = [
    {
        "role": "user",
        "content": "What are fractions?",
        "timestamp": "2024-12-01T10:00:00Z"
    },
    {
        "role": "assistant", 
        "content": "Fractions represent parts of a whole...",
        "timestamp": "2024-12-01T10:00:05Z"
    }
]

# Continue conversation
response = httpx.post(
    "http://localhost:8000/ask",
    json={
        "session_id": "math-lesson-1",
        "user_id": "student-456",
        "message": "Can you give me an example?",
        "conversation_history": conversation_history,
        "context": {"subject": "Math", "grade_level": "4th grade"}
    }
)
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | None |
| `ANTHROPIC_API_KEY` | Anthropic API key | None |
| `GOOGLE_API_KEY` | Google AI API key | None |
| `SERVICE_NAME` | Service identifier | "ai-service" |
| `SERVICE_PORT` | Port to run on | 8000 |
| `DEBUG` | Enable debug mode | false |
| `LOG_LEVEL` | Logging level | "INFO" |
| `MAIN_SERVER_URL` | Main server URL | "http://localhost:3000" |

### LLM Provider Fallback

The system automatically falls back between providers:
1. Uses preferred provider if specified and available
2. Falls back to other configured providers
3. Returns error if all providers fail

## Performance & Scalability

### Production Deployment
```bash
# Multi-worker deployment
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# With gunicorn for better process management
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

### Load Testing
```bash
# Install locust for load testing
pip install locust

# Create locustfile.py with test scenarios
# Run load test
locust -f locustfile.py --host=http://localhost:8000
```

### Monitoring
- Health check endpoint: `/health`
- Response includes processing time metrics
- Structured logging for observability

## Development

### Adding New Agents

1. Create new service directory: `new_agent_service/`
2. Follow the same structure as `qna_agent_service/`
3. Implement agent logic in `agent.py`
4. Create FastAPI endpoints in `main.py`
5. Add tests in `test_agent.py`

### Shared Utilities

All services share common utilities in `shared/`:
- `models.py`: API request/response models
- `llm_client.py`: Multi-provider LLM client
- `config.py`: Configuration management

## Security

### API Key Management
- Store API keys in environment variables
- Never commit API keys to version control
- Use different keys for development/production

### Input Validation
- All inputs validated with Pydantic models
- SQL injection prevention (when database is added)
- Rate limiting (implement at gateway level)

## Troubleshooting

### Common Issues

**"No LLM providers configured"**
- Check that API keys are set in environment
- Verify `.env` file is loaded correctly

**Import errors with shared modules**
- Ensure Python path includes shared directory
- Check virtual environment is activated

**Port already in use**
- Change `SERVICE_PORT` environment variable
- Kill existing processes: `lsof -ti:8000 | xargs kill`

### Debugging
```bash
# Enable debug mode
export DEBUG=true
export LOG_LEVEL=DEBUG

# Run with verbose logging
python main.py
```

## Future Enhancements

- [ ] Database integration for conversation persistence
- [ ] Caching layer for improved performance  
- [ ] Authentication and user management
- [ ] Real-time WebSocket support
- [ ] Advanced personalization algorithms
- [ ] Multi-modal support (images, audio)
- [ ] Integration with main NestJS server

---

**Status**: ✅ **Production Ready Foundation**  
**Last Updated**: December 2024