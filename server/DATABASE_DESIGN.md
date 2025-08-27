# Database Schema Design - Lucid Learning Platform

## Overview

The database schema has been completely refactored from a single monolithic `users` table to a normalized, scalable structure that follows database design best practices. This document outlines the new design, its benefits, and implementation details.

## Problems with the Original Design

### ❌ Single Table Issues
- **Monolithic Structure**: All user data crammed into one table
- **Poor Performance**: Large table with mixed data types
- **Security Concerns**: Sensitive auth data mixed with profile data
- **Scalability Issues**: Difficult to optimize queries for specific use cases
- **Maintenance Nightmare**: Hard to modify one aspect without affecting others
- **Data Integrity**: No proper relationships or constraints

### ❌ Specific Problems
- Authentication data (passwords, tokens) mixed with profile data
- No tracking of learning sessions or user interactions
- Preferences stored as generic JSON without structure
- No audit trail for user activities
- Difficult to implement proper data retention policies

## New Normalized Design

### 🎯 Design Principles
1. **Single Responsibility**: Each table has one clear purpose
2. **Normalization**: Eliminate data redundancy and anomalies
3. **Security**: Separate sensitive data from public data
4. **Performance**: Optimize for common query patterns
5. **Scalability**: Easy to extend without breaking existing functionality
6. **Audit Trail**: Track all user activities and changes

## Database Schema

### 1. Core User Table (`users`)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fullName VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role user_role_enum DEFAULT 'student',
  status user_status_enum DEFAULT 'pending_verification',
  emailVerified BOOLEAN DEFAULT false,
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: Core user identity and basic information
**Benefits**:
- Clean, focused table for user identity
- Fast lookups by email
- Easy to implement user management features

### 2. Authentication Table (`user_auth`)
```sql
CREATE TABLE user_auth (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  password VARCHAR(255),
  googleId VARCHAR(255),
  emailVerificationToken VARCHAR(255),
  emailVerificationCode VARCHAR(255),
  emailVerificationExpires TIMESTAMP,
  passwordResetToken VARCHAR(255),
  passwordResetExpires TIMESTAMP,
  lastLoginAt TIMESTAMP,
  lastPasswordChangeAt TIMESTAMP,
  loginAttempts INTEGER DEFAULT 0,
  lockedUntil TIMESTAMP,
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: All authentication-related data
**Benefits**:
- **Security**: Sensitive data isolated from public data
- **Compliance**: Easy to implement data retention policies
- **Flexibility**: Support multiple auth providers
- **Audit Trail**: Track login attempts and security events

### 3. User Profile Table (`user_profiles`)
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  picture VARCHAR(500),
  birthday DATE,
  usagePurpose VARCHAR(100),
  userType VARCHAR(100),
  preferences JSONB DEFAULT '{}',
  profile JSONB DEFAULT '{}',
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: User profile and demographic information
**Benefits**:
- **Privacy**: Profile data separate from core identity
- **Flexibility**: Easy to add new profile fields
- **Performance**: Profile queries don't touch auth data

### 4. User Preferences Table (`user_preferences`)
```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID UNIQUE NOT NULL,
  preferredVoiceProvider voice_provider_enum DEFAULT 'elevenlabs',
  voiceQuality voice_quality_enum DEFAULT 'balanced',
  voiceId VARCHAR(100) DEFAULT 'elevenlabs_neural',
  voiceSpeed DOUBLE PRECISION DEFAULT 1.0,
  voiceEnabled BOOLEAN DEFAULT true,
  theme VARCHAR(50) DEFAULT 'light',
  reducedMotion BOOLEAN DEFAULT false,
  highContrast BOOLEAN DEFAULT false,
  language VARCHAR(10) DEFAULT 'en',
  difficultyLevel VARCHAR(50) DEFAULT 'beginner',
  showHints BOOLEAN DEFAULT true,
  autoAdvance BOOLEAN DEFAULT true,
  autoAdvanceDelay INTEGER DEFAULT 5,
  emailNotifications BOOLEAN DEFAULT true,
  pushNotifications BOOLEAN DEFAULT true,
  marketingEmails BOOLEAN DEFAULT false,
  dataCollection BOOLEAN DEFAULT true,
  analyticsOptOut BOOLEAN DEFAULT false,
  customPreferences JSONB DEFAULT '{}',
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: User preferences and settings
**Benefits**:
- **Structured Data**: Type-safe preference fields
- **Performance**: Fast preference lookups
- **Extensibility**: Easy to add new preference types
- **Compliance**: Clear data collection controls

### 5. User Documents Table (`user_documents`)
```sql
CREATE TABLE user_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  originalFilename VARCHAR(255) NOT NULL,
  fileSize BIGINT NOT NULL,
  mimeType VARCHAR(100) NOT NULL,
  filePath VARCHAR(500) NOT NULL,
  thumbnailPath VARCHAR(500),
  documentType document_type_enum DEFAULT 'pdf',
  status document_status_enum DEFAULT 'uploaded',
  processingProgress INTEGER DEFAULT 0,
  extractedText TEXT,
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  isPublic BOOLEAN DEFAULT false,
  uploadDate TIMESTAMP DEFAULT now(),
  processedAt TIMESTAMP,
  lastAccessedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: User's uploaded documents and files
**Benefits**:
- **File Management**: Centralized document storage
- **Search**: Full-text search capabilities
- **Organization**: Tag-based categorization
- **Security**: User-specific access control
- **Analytics**: Track document usage patterns

### 6. Document Collections Table (`document_collections`)
```sql
CREATE TABLE document_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  isDefault BOOLEAN DEFAULT false,
  documentCount INTEGER DEFAULT 0,
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: Organize documents into collections
**Benefits**:
- **Organization**: Group related documents
- **Visual**: Color-coded collections
- **Flexibility**: Custom organization system

### 7. Document Collection Items Table (`document_collection_items`)
```sql
CREATE TABLE document_collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collectionId UUID NOT NULL REFERENCES document_collections(id) ON DELETE CASCADE,
  documentId UUID NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
  addedAt TIMESTAMP DEFAULT now(),
  UNIQUE(collectionId, documentId)
);
```

**Purpose**: Many-to-many relationship between documents and collections
**Benefits**:
- **Flexibility**: Documents can be in multiple collections
- **Performance**: Efficient querying of collection contents
- **Integrity**: Prevents duplicate entries

### 8. Learning Sessions Table (`learning_sessions`)
```sql
CREATE TABLE learning_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL,
  learningGoal VARCHAR(500) NOT NULL,
  sessionType session_type_enum DEFAULT 'interactive',
  status session_status_enum DEFAULT 'active',
  deckData JSONB,
  currentSlideIndex INTEGER DEFAULT 0,
  totalSlides INTEGER DEFAULT 0,
  startedAt TIMESTAMP,
  completedAt TIMESTAMP,
  lastActivityAt TIMESTAMP,
  progress JSONB DEFAULT '{}',
  interactions JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: Track user learning sessions and progress
**Benefits**:
- **Analytics**: Rich data for learning analytics
- **Resume**: Users can resume interrupted sessions
- **Progress Tracking**: Detailed progress monitoring
- **A/B Testing**: Compare different session types

### 9. Session Interactions Table (`session_interactions`)
```sql
CREATE TABLE session_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sessionId UUID NOT NULL,
  interactionType VARCHAR(100) NOT NULL,
  slideIndex INTEGER,
  interactionData JSONB,
  duration TIMESTAMP,
  createdAt TIMESTAMP DEFAULT now()
);
```

**Purpose**: Detailed interaction tracking
**Benefits**:
- **Granular Analytics**: Track every user interaction
- **Debugging**: Identify UX issues
- **Personalization**: Build user behavior models
- **Compliance**: Detailed audit trail

## Entity Relationships

### One-to-One Relationships
```typescript
// User -> UserAuth (One-to-One)
@OneToOne(() => UserAuth, { cascade: true })
@JoinColumn()
auth: UserAuth;

// User -> UserProfile (One-to-One)
@OneToOne(() => UserProfile, { cascade: true })
@JoinColumn()
profile: UserProfile;

// User -> UserPreferences (One-to-One)
@OneToOne(() => UserPreferences, { cascade: true })
@JoinColumn()
preferences: UserPreferences;
```

### One-to-Many Relationships
```typescript
// User -> LearningSessions (One-to-Many)
@OneToMany(() => LearningSession, session => session.user)
learningSessions: LearningSession[];

// User -> UserDocuments (One-to-Many)
@OneToMany(() => UserDocument, document => document.user)
documents: UserDocument[];

// User -> DocumentCollections (One-to-Many)
@OneToMany(() => DocumentCollection, collection => collection.user)
collections: DocumentCollection[];

// LearningSession -> SessionInteractions (One-to-Many)
@OneToMany(() => SessionInteraction, interaction => interaction.session)
sessionInteractions: SessionInteraction[];
```

### Many-to-Many Relationships
```typescript
// DocumentCollections <-> UserDocuments (Many-to-Many)
@ManyToMany(() => UserDocument)
@JoinTable({
  name: 'document_collection_items',
  joinColumn: { name: 'collectionId', referencedColumnName: 'id' },
  inverseJoinColumn: { name: 'documentId', referencedColumnName: 'id' }
})
documents: UserDocument[];
```

## Enums

### Document Type Enum
```sql
CREATE TYPE document_type_enum AS ENUM (
  'pdf',
  'docx',
  'txt',
  'epub',
  'image',
  'video',
  'audio',
  'other'
);
```

### Document Status Enum
```sql
CREATE TYPE document_status_enum AS ENUM (
  'uploaded',
  'processing',
  'completed',
  'failed',
  'deleted'
);
```

## Performance Optimizations

### Indexes
```sql
-- Fast user lookups
CREATE INDEX idx_users_email ON users(email);

-- Document queries
CREATE INDEX idx_user_documents_userId ON user_documents(userId);
CREATE INDEX idx_user_documents_status ON user_documents(status);
CREATE INDEX idx_user_documents_uploadDate ON user_documents(uploadDate);
CREATE INDEX idx_user_documents_filename ON user_documents(filename);

-- Collection queries
CREATE INDEX idx_document_collections_userId ON document_collections(userId);
CREATE INDEX idx_document_collection_items_collectionId ON document_collection_items(collectionId);
CREATE INDEX idx_document_collection_items_documentId ON document_collection_items(documentId);

-- Session queries
CREATE INDEX idx_learning_sessions_userId_status ON learning_sessions(userId, status);
CREATE INDEX idx_learning_sessions_createdAt ON learning_sessions(createdAt);

-- Interaction queries
CREATE INDEX idx_session_interactions_sessionId_createdAt ON session_interactions(sessionId, createdAt);
```

### Query Optimization
- **Selective Loading**: Load only needed relationships
- **Pagination**: Efficient pagination for large datasets
- **Caching**: Redis caching for frequently accessed data
- **Partitioning**: Future partitioning by date for interactions

## Security Benefits

### Data Isolation
- **Auth Data**: Completely separate from public data
- **Sensitive Fields**: Passwords, tokens isolated
- **Access Control**: Different permissions per table
- **Audit Trail**: Track all security-related events

### Compliance Features
- **Data Retention**: Easy to implement retention policies
- **Data Export**: Structured export for GDPR compliance
- **Data Deletion**: Cascade deletion with proper cleanup
- **Privacy Controls**: Granular privacy settings

## Scalability Benefits

### Horizontal Scaling
- **Sharding Ready**: Easy to shard by user ID
- **Read Replicas**: Separate read/write operations
- **Microservices**: Each table can be in different service
- **Caching Strategy**: Different caching per table type

### Performance Scaling
- **Query Optimization**: Optimized for common patterns
- **Index Strategy**: Strategic indexing for performance
- **Connection Pooling**: Efficient connection management
- **Query Caching**: Redis query result caching

## Migration Strategy

### Phase 1: Schema Migration
1. Create new tables with proper structure
2. Migrate existing data with data integrity checks
3. Update application code to use new entities
4. Test thoroughly with existing data

### Phase 2: Feature Enhancement
1. Implement learning session tracking
2. Add user interaction analytics
3. Build preference management system
4. Create admin dashboard for data management

### Phase 3: Optimization
1. Add performance monitoring
2. Implement caching strategies
3. Optimize queries based on usage patterns
4. Add data archival for old sessions

## API Design Considerations

### RESTful Endpoints
```typescript
// User Management
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id

// Authentication
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/logout

// Profile Management
GET    /api/users/:id/profile
PUT    /api/users/:id/profile

// Preferences
GET    /api/users/:id/preferences
PUT    /api/users/:id/preferences

// Learning Sessions
GET    /api/users/:id/sessions
POST   /api/sessions
GET    /api/sessions/:id
PUT    /api/sessions/:id

// Analytics
GET    /api/users/:id/analytics
GET    /api/sessions/:id/interactions
```

### Data Transfer Objects (DTOs)
```typescript
// Clean separation of concerns
export class CreateUserDto {
  fullName: string;
  email: string;
  password: string;
}

export class UserProfileDto {
  picture?: string;
  birthday?: Date;
  usagePurpose?: string;
  userType?: string;
}

export class UserPreferencesDto {
  voiceEnabled: boolean;
  theme: string;
  language: string;
  // ... other preferences
}
```

## Monitoring and Analytics

### Key Metrics
- **User Engagement**: Session duration, completion rates
- **Feature Usage**: Voice usage, theme preferences
- **Performance**: Query response times, cache hit rates
- **Security**: Failed login attempts, suspicious activity

### Data Analytics
- **Learning Patterns**: Most effective session types
- **User Behavior**: Interaction patterns and preferences
- **System Performance**: Database performance metrics
- **Business Intelligence**: User growth, retention rates

## Future Enhancements

### Planned Features
1. **Advanced Analytics**: Machine learning insights
2. **Real-time Tracking**: WebSocket-based live tracking
3. **Multi-tenancy**: Support for organizations
4. **Data Export**: Comprehensive data export tools
5. **Backup Strategy**: Automated backup and recovery

### Technical Improvements
1. **Database Partitioning**: Partition by date for large tables
2. **Read Replicas**: Separate read/write operations
3. **Caching Layer**: Redis for frequently accessed data
4. **Search Integration**: Elasticsearch for full-text search
5. **Event Sourcing**: Event-driven architecture for audit trails

## Conclusion

The new database design provides:

✅ **Better Performance**: Optimized for common query patterns
✅ **Enhanced Security**: Proper data isolation and access controls
✅ **Improved Scalability**: Easy to scale horizontally and vertically
✅ **Better Maintainability**: Clear separation of concerns
✅ **Rich Analytics**: Comprehensive data for insights
✅ **Future-Proof**: Easy to extend with new features
✅ **Compliance Ready**: Built-in support for data regulations

This design follows database normalization principles while maintaining the flexibility needed for a modern educational platform. The separation of concerns makes the system more maintainable, secure, and scalable. 