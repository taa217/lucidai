import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserCustomization1755000000000 implements MigrationInterface {
  name = 'CreateUserCustomization1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_customizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "displayName" character varying(150),
        "occupation" character varying(150),
        "traits" character varying(500),
        "extraNotes" text,
        "preferredLanguage" character varying(50),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_customizations_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_customizations_userId" UNIQUE ("userId"),
        CONSTRAINT "FK_user_customizations_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Backfill from existing user_preferences.customPreferences when present
    await queryRunner.query(`
      INSERT INTO "user_customizations" ("userId", "displayName", "occupation", "traits", "extraNotes", "preferredLanguage")
      SELECT up."userId",
             (up."customPreferences" ->> 'displayName'),
             (up."customPreferences" ->> 'occupation'),
             (up."customPreferences" ->> 'traits'),
             (up."customPreferences" ->> 'extraNotes'),
             COALESCE((up."customPreferences" ->> 'preferredLanguage'), up."language")
      FROM "user_preferences" up
      WHERE NOT EXISTS (
        SELECT 1 FROM "user_customizations" uc WHERE uc."userId" = up."userId"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_customizations"`);
  }
}





























