import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorUserSchema1753000000002 implements MigrationInterface {
  name = 'RefactorUserSchema1753000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_auth table
    await queryRunner.query(`
      CREATE TABLE "user_auth" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "password" character varying(255),
        "googleId" character varying(255),
        "emailVerificationToken" character varying(255),
        "emailVerificationCode" character varying(255),
        "emailVerificationExpires" TIMESTAMP,
        "passwordResetToken" character varying(255),
        "passwordResetExpires" TIMESTAMP,
        "lastLoginAt" TIMESTAMP,
        "lastPasswordChangeAt" TIMESTAMP,
        "loginAttempts" integer NOT NULL DEFAULT '0',
        "lockedUntil" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_auth_id" PRIMARY KEY ("id")
      )
    `);

    // Create user_profiles table
    await queryRunner.query(`
      CREATE TABLE "user_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "picture" character varying(500),
        "birthday" date,
        "usagePurpose" character varying(100),
        "userType" character varying(100),
        "preferences" jsonb NOT NULL DEFAULT '{}',
        "profile" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_profiles_id" PRIMARY KEY ("id")
      )
    `);

    // Create user_preferences table
    await queryRunner.query(`
      CREATE TYPE "public"."voice_provider_enum" AS ENUM('elevenlabs', 'azure', 'gtts')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."voice_quality_enum" AS ENUM('fast', 'balanced', 'high')
    `);

    await queryRunner.query(`
      CREATE TABLE "user_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "preferredVoiceProvider" "public"."voice_provider_enum" NOT NULL DEFAULT 'elevenlabs',
        "voiceQuality" "public"."voice_quality_enum" NOT NULL DEFAULT 'balanced',
        "voiceId" character varying(100) NOT NULL DEFAULT 'elevenlabs_neural',
        "voiceSpeed" double precision NOT NULL DEFAULT '1',
        "voiceEnabled" boolean NOT NULL DEFAULT true,
        "theme" character varying(50) NOT NULL DEFAULT 'light',
        "reducedMotion" boolean NOT NULL DEFAULT false,
        "highContrast" boolean NOT NULL DEFAULT false,
        "language" character varying(10) NOT NULL DEFAULT 'en',
        "difficultyLevel" character varying(50) NOT NULL DEFAULT 'beginner',
        "showHints" boolean NOT NULL DEFAULT true,
        "autoAdvance" boolean NOT NULL DEFAULT true,
        "autoAdvanceDelay" integer NOT NULL DEFAULT '5',
        "emailNotifications" boolean NOT NULL DEFAULT true,
        "pushNotifications" boolean NOT NULL DEFAULT true,
        "marketingEmails" boolean NOT NULL DEFAULT false,
        "dataCollection" boolean NOT NULL DEFAULT true,
        "analyticsOptOut" boolean NOT NULL DEFAULT false,
        "customPreferences" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_preferences_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_preferences_userId" UNIQUE ("userId")
      )
    `);

    // Create learning_sessions table
    await queryRunner.query(`
      CREATE TYPE "public"."session_status_enum" AS ENUM('active', 'paused', 'completed', 'abandoned')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."session_type_enum" AS ENUM('interactive', 'read', 'research')
    `);

    await queryRunner.query(`
      CREATE TABLE "learning_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "learningGoal" character varying(500) NOT NULL,
        "sessionType" "public"."session_type_enum" NOT NULL DEFAULT 'interactive',
        "status" "public"."session_status_enum" NOT NULL DEFAULT 'active',
        "deckData" jsonb,
        "currentSlideIndex" integer NOT NULL DEFAULT '0',
        "totalSlides" integer NOT NULL DEFAULT '0',
        "startedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "lastActivityAt" TIMESTAMP,
        "progress" jsonb NOT NULL DEFAULT '{}',
        "interactions" jsonb NOT NULL DEFAULT '{}',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_learning_sessions_id" PRIMARY KEY ("id")
      )
    `);

    // Create session_interactions table
    await queryRunner.query(`
      CREATE TABLE "session_interactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sessionId" uuid NOT NULL,
        "interactionType" character varying(100) NOT NULL,
        "slideIndex" integer,
        "interactionData" jsonb,
        "duration" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_session_interactions_id" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "user_preferences" 
      ADD CONSTRAINT "FK_user_preferences_userId" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "learning_sessions" 
      ADD CONSTRAINT "FK_learning_sessions_userId" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "session_interactions" 
      ADD CONSTRAINT "FK_session_interactions_sessionId" 
      FOREIGN KEY ("sessionId") REFERENCES "learning_sessions"("id") ON DELETE CASCADE
    `);

    // Add indexes for performance
    await queryRunner.query(`
      CREATE INDEX "IDX_learning_sessions_userId_status" ON "learning_sessions" ("userId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_learning_sessions_createdAt" ON "learning_sessions" ("createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_session_interactions_sessionId_createdAt" ON "session_interactions" ("sessionId", "createdAt")
    `);

    // Migrate existing data from users table to new structure
    await queryRunner.query(`
      INSERT INTO "user_auth" (
        "id", "password", "googleId", "emailVerificationToken", 
        "emailVerificationCode", "emailVerificationExpires", "passwordResetToken", 
        "passwordResetExpires", "lastLoginAt", "lastPasswordChangeAt", 
        "loginAttempts", "lockedUntil", "createdAt", "updatedAt"
      )
      SELECT 
        uuid_generate_v4(), "password", "googleId", "emailVerificationToken",
        "emailVerificationCode", "emailVerificationExpires", "passwordResetToken",
        "passwordResetExpires", "lastLoginAt", "lastPasswordChangeAt",
        "loginAttempts", "lockedUntil", "createdAt", "updatedAt"
      FROM "users"
    `);

    await queryRunner.query(`
      INSERT INTO "user_profiles" (
        "id", "picture", "birthday", "usagePurpose", "userType", 
        "preferences", "profile", "createdAt", "updatedAt"
      )
      SELECT 
        uuid_generate_v4(), "picture", "birthday", "usagePurpose", "userType",
        "preferences", "profile", "createdAt", "updatedAt"
      FROM "users"
    `);

    // Add auth and profile foreign keys to users table
    await queryRunner.query(`
      ALTER TABLE "users" ADD "authId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "profileId" uuid
    `);

    // Update users table to reference the new auth and profile records
    await queryRunner.query(`
      UPDATE "users" 
      SET "authId" = (
        SELECT "id" FROM "user_auth" 
        WHERE "user_auth"."password" = "users"."password" 
        LIMIT 1
      )
    `);

    await queryRunner.query(`
      UPDATE "users" 
      SET "profileId" = (
        SELECT "id" FROM "user_profiles" 
        WHERE "user_profiles"."picture" = "users"."picture" 
        LIMIT 1
      )
    `);

    // Add foreign key constraints for users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD CONSTRAINT "FK_users_authId" 
      FOREIGN KEY ("authId") REFERENCES "user_auth"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD CONSTRAINT "FK_users_profileId" 
      FOREIGN KEY ("profileId") REFERENCES "user_profiles"("id") ON DELETE CASCADE
    `);

    // Remove old columns from users table
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "password"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "googleId"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "picture"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "birthday"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "usagePurpose"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "userType"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "emailVerificationToken"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "emailVerificationCode"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "emailVerificationExpires"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "passwordResetToken"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "passwordResetExpires"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "lastLoginAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "lastPasswordChangeAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "loginAttempts"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "lockedUntil"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "preferences"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "profile"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back old columns to users table
    await queryRunner.query(`
      ALTER TABLE "users" ADD "password" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "googleId" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "picture" character varying(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "birthday" date
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "usagePurpose" character varying(100)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "userType" character varying(100)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "emailVerificationToken" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "emailVerificationCode" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "emailVerificationExpires" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "passwordResetToken" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "passwordResetExpires" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "lastLoginAt" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "lastPasswordChangeAt" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "loginAttempts" integer NOT NULL DEFAULT '0'
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "lockedUntil" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "preferences" jsonb NOT NULL DEFAULT '{}'
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "profile" jsonb NOT NULL DEFAULT '{}'
    `);

    // Migrate data back (simplified - would need more complex logic in production)
    await queryRunner.query(`
      UPDATE "users" 
      SET "password" = "user_auth"."password",
          "googleId" = "user_auth"."googleId",
          "emailVerificationToken" = "user_auth"."emailVerificationToken",
          "emailVerificationCode" = "user_auth"."emailVerificationCode",
          "emailVerificationExpires" = "user_auth"."emailVerificationExpires",
          "passwordResetToken" = "user_auth"."passwordResetToken",
          "passwordResetExpires" = "user_auth"."passwordResetExpires",
          "lastLoginAt" = "user_auth"."lastLoginAt",
          "lastPasswordChangeAt" = "user_auth"."lastPasswordChangeAt",
          "loginAttempts" = "user_auth"."loginAttempts",
          "lockedUntil" = "user_auth"."lockedUntil"
      FROM "user_auth"
      WHERE "users"."authId" = "user_auth"."id"
    `);

    await queryRunner.query(`
      UPDATE "users" 
      SET "picture" = "user_profiles"."picture",
          "birthday" = "user_profiles"."birthday",
          "usagePurpose" = "user_profiles"."usagePurpose",
          "userType" = "user_profiles"."userType",
          "preferences" = "user_profiles"."preferences",
          "profile" = "user_profiles"."profile"
      FROM "user_profiles"
      WHERE "users"."profileId" = "user_profiles"."id"
    `);

    // Remove foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "FK_users_authId"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "FK_users_profileId"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_preferences" DROP CONSTRAINT "FK_user_preferences_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "learning_sessions" DROP CONSTRAINT "FK_learning_sessions_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "session_interactions" DROP CONSTRAINT "FK_session_interactions_sessionId"
    `);

    // Remove columns
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "authId"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "profileId"
    `);

    // Drop new tables
    await queryRunner.query(`DROP TABLE "session_interactions"`);
    await queryRunner.query(`DROP TABLE "learning_sessions"`);
    await queryRunner.query(`DROP TABLE "user_preferences"`);
    await queryRunner.query(`DROP TABLE "user_profiles"`);
    await queryRunner.query(`DROP TABLE "user_auth"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE "public"."session_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."session_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."voice_provider_enum"`);
    await queryRunner.query(`DROP TYPE "public"."voice_quality_enum"`);
  }
} 