import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { UserAuth } from './entities/user-auth.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { LearningSession, SessionInteraction } from './entities/learning-session.entity';
import { UserDocument } from './entities/user-document.entity';
import { DocumentCollection } from './entities/document-collection.entity';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import * as dotenv from 'dotenv';
dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User, 
    UserAuth, 
    UserProfile, 
    UserPreferences, 
    LearningSession, 
    SessionInteraction,
    UserDocument,
    DocumentCollection,
    ChatSession,
    ChatMessage
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: true,
  ssl: { rejectUnauthorized: false }, // <--- This is the key!
}); 