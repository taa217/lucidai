import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AIAgentClientService } from './ai-agent-client.service';
import { AgentRequestDto, LLMProvider, MessageRole } from '../dto/agent.dto';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AIAgentClientService', () => {
  let service: AIAgentClientService;
  let configService: ConfigService;

  const mockConfig = {
    pythonServices: {
      qnaAgent: {
        url: 'http://localhost:8000',
        timeout: 30000,
      },
    },
  };

  const mockAxiosInstance = {
    post: jest.fn(),
    get: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIAgentClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'pythonServices') {
                return mockConfig.pythonServices;
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AIAgentClientService>(AIAgentClientService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('askQuestion', () => {
    const mockRequest: AgentRequestDto = {
      sessionId: 'test-session',
      userId: 'test-user',
      message: 'What is the capital of France?',
      conversationHistory: [
        {
          role: MessageRole.USER,
          content: 'Hello',
          timestamp: new Date(),
        },
      ],
      preferredProvider: LLMProvider.OPENAI,
      context: { subject: 'geography' },
    };

    const mockResponse = {
      data: {
        sessionId: 'test-session',
        response: 'The capital of France is Paris.',
        confidence: 0.95,
        providerUsed: LLMProvider.OPENAI,
        processingTimeMs: 1250,
        metadata: { tokensUsed: 150 },
      },
    };

    it('should successfully process a question', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await service.askQuestion(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ask', {
        session_id: mockRequest.sessionId,
        user_id: mockRequest.userId,
        message: mockRequest.message,
        conversation_history: mockRequest.conversationHistory,
        preferred_provider: mockRequest.preferredProvider,
        context: mockRequest.context,
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('should handle network errors', async () => {
      const networkError = {
        request: {},
        message: 'Network Error',
      };
      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(service.askQuestion(mockRequest)).rejects.toThrow(
        new HttpException(
          'AI service unavailable - please try again later',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );
    });

    it('should handle 400 Bad Request errors', async () => {
      const badRequestError = {
        response: {
          status: 400,
          data: { error: 'Invalid request format' },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(badRequestError);

      await expect(service.askQuestion(mockRequest)).rejects.toThrow(
        new HttpException('Invalid request format', HttpStatus.BAD_REQUEST),
      );
    });

    it('should handle 503 Service Unavailable errors', async () => {
      const serviceUnavailableError = {
        response: {
          status: 503,
          data: { error: 'Service temporarily unavailable' },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(serviceUnavailableError);

      await expect(service.askQuestion(mockRequest)).rejects.toThrow(
        new HttpException(
          'Service temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );
    });
  });

  describe('checkQnAAgentHealth', () => {
    const mockHealthResponse = {
      data: {
        service: 'QnA Agent Service',
        status: 'healthy',
        timestamp: new Date(),
        version: '0.1.0',
      },
    };

    it('should successfully check health', async () => {
      mockAxiosInstance.get.mockResolvedValue(mockHealthResponse);

      const result = await service.checkQnAAgentHealth();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual(mockHealthResponse.data);
    });

    it('should handle health check failures', async () => {
      const error = {
        response: {
          status: 503,
          data: { error: 'Service unhealthy' },
        },
      };
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(service.checkQnAAgentHealth()).rejects.toThrow(
        new HttpException('Service unhealthy', HttpStatus.SERVICE_UNAVAILABLE),
      );
    });
  });

  describe('getServicesStatus', () => {
    it('should get status of all services', async () => {
      const mockHealthResponse = {
        data: {
          service: 'QnA Agent Service',
          status: 'healthy',
          timestamp: new Date(),
          version: '0.1.0',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockHealthResponse);

      const result = await service.getServicesStatus();

      expect(result).toEqual({
        qnaAgent: mockHealthResponse.data,
      });
    });

    it('should handle service status check failures', async () => {
      const error = new Error('Connection failed');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(service.getServicesStatus()).rejects.toThrow(
        new HttpException(
          'Unable to check AI services status',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );
    });
  });
}); 