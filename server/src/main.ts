import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildCorsOrigins } from './utils/cors.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS (env-driven for production)
  const origins = buildCorsOrigins(process.env);
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'x-user-id', 'X-Requested-With', 'Accept', 'Origin'],
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
