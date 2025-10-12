import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

import { AppModule } from '../src/app.module';

let cachedServer: ReturnType<typeof express> | null = null;

async function bootstrapExpressServer() {
  const expressInstance = express();

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressInstance));

  const corsOriginEnv = process.env.CORS_ORIGIN;
  const defaultOrigins: (string | RegExp)[] = [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:19000',
    /^http:\/\/10\.0\.2\.2:(19000|19006|8081)$/,
    /^http:\/\/192\.168\.\d+\.\d+:(19000|19006|8081)$/,
    /^http:\/\/10\.\d+\.\d+\.\d+:(19000|19006|8081)$/,
    /^http:\/\/172\.\d+\.\d+\.\d+:(19000|19006|8081)$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ];
  const origins = corsOriginEnv
    ? corsOriginEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : defaultOrigins;

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'x-user-id'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  const config = new DocumentBuilder()
    .setTitle('Lucid Learn AI - Backend API')
    .setDescription('Backend API for the Lucid Learn AI platform')
    .setVersion('1.0')
    .addTag('AI Agents', 'Endpoints for AI agent communication')
    .addTag('Health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.init();
  return expressInstance;
}

export default async function handler(req: any, res: any) {
  if (!cachedServer) {
    cachedServer = await bootstrapExpressServer();
  }
  return (cachedServer as unknown as (req: any, res: any) => void)(req, res);
}


