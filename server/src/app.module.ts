import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AIAgentModule } from './modules/ai-agent.module';
import { SlidesModule } from './modules/slides.module';
import { SlidesPipelineModule } from './modules/slides_pipeline.module';
import { AuthModule } from './modules/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserAuth } from './entities/user-auth.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { LearningSession, SessionInteraction } from './entities/learning-session.entity';
import { UserCustomization } from './entities/user-customization.entity';
import { UserDocument } from './entities/user-document.entity';
import { DocumentCollection } from './entities/document-collection.entity';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ResearchSession } from './entities/research-session.entity';
import { ResearchMessage } from './entities/research-message.entity';
import { ResearchSource } from './entities/research-source.entity';
import { DocumentController } from './controllers/document.controller';
import { DocumentService } from './services/document.service';
import { ChatController } from './controllers/chat.controller';
import { StorageService } from './services/storage.service';
import { ResearchController } from './controllers/research.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [User, UserAuth, UserProfile, UserPreferences, UserCustomization, LearningSession, SessionInteraction, UserDocument, DocumentCollection, ChatSession, ChatMessage, ResearchSession, ResearchMessage, ResearchSource],
      synchronize: false,
      autoLoadEntities: true,
      logging: true,
      ssl: { rejectUnauthorized: false },
    }),
    TypeOrmModule.forFeature([User, UserAuth, UserProfile, UserPreferences, UserCustomization, LearningSession, SessionInteraction, UserDocument, DocumentCollection, ChatSession, ChatMessage, ResearchSession, ResearchMessage, ResearchSource]),
    AuthModule,
    AIAgentModule,
    SlidesModule,
    SlidesPipelineModule,
  ],
  controllers: [AppController, DocumentController, ChatController, ResearchController],
  providers: [AppService, DocumentService, StorageService],
})
export class AppModule {}
