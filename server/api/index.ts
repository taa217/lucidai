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

  const envCors = [
    process.env.CORS_ORIGIN,
    process.env.CORS_ORIGINS, // support plural name
    process.env.FRONTEND_URL, // also allow explicit frontend origin
  ]
    .filter(Boolean)
    .join(',');

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
    // Allow any Vercel deployment domains by default
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  ];

  const origins: (string | RegExp)[] = [...defaultOrigins];
  if (envCors) {
    envCors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => origins.push(o));
  }
  // Also include the deployment URL if available
  if (process.env.VERCEL_URL) {
    const vercelOrigin = `https://${process.env.VERCEL_URL}`;
    if (!origins.includes(vercelOrigin)) origins.push(vercelOrigin);
  }

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-User-ID',
      'x-user-id',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
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


