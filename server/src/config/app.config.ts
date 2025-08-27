export interface AppConfig {
  port: number;
  environment: string;
  pythonServices: {
    qnaAgent: {
      url: string;
      timeout: number;
    };
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  environment: process.env.NODE_ENV || 'development',
  pythonServices: {
    qnaAgent: {
      url: process.env.QNA_AGENT_URL || 'http://localhost:8000',
      timeout: parseInt(process.env.QNA_AGENT_TIMEOUT || '30000', 10),
    },
  },
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8000'],
    credentials: true,
  },
}); 