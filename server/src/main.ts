import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS (env-driven for production)
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const defaultOrigins: (string | RegExp)[] = [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:19000', // Expo web
    'exp://localhost:19000', // Expo app
    // Common development network ranges
    /^http:\/\/10\.0\.2\.2:(19000|19006|8081)$/, // Android emulator
    /^http:\/\/192\.168\.\d+\.\d+:(19000|19006|8081)$/, // Local network
    /^http:\/\/10\.\d+\.\d+\.\d+:(19000|19006|8081)$/, // Local network
    /^http:\/\/172\.\d+\.\d+\.\d+:(19000|19006|8081)$/, // Local network
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ];
  const origins = corsOriginEnv ? corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean) : defaultOrigins;
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'x-user-id'],
    credentials: true,
  });

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Lucid Learn AI - Backend API')
    .setDescription('Backend API for the Lucid Learn AI platform')
    .setVersion('1.0')
    .addTag('AI Agents', 'Endpoints for AI agent communication')
    .addTag('Health', 'Health check endpoints')
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Lucid Learn AI Backend is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation available at: http://localhost:${port}/api`);
}

bootstrap();
