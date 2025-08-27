import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResearchTables1757000000000 implements MigrationInterface {
  name = 'CreateResearchTables1757000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "research_sessions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "title" character varying(255),
      "messageCount" integer NOT NULL DEFAULT 0,
      "lastMessageAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_research_sessions_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_research_sessions_user_updated" ON "research_sessions" ("userId", "updatedAt")`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "research_messages" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "sessionId" uuid NOT NULL,
      "userId" uuid NOT NULL,
      "role" character varying(20) NOT NULL,
      "content" text NOT NULL,
      "thoughts" text,
      "metadata" jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_research_messages_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_research_messages_session_created" ON "research_messages" ("sessionId", "createdAt")`);
    await queryRunner.query(`ALTER TABLE "research_messages" ADD CONSTRAINT "FK_research_messages_session" FOREIGN KEY ("sessionId") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "research_sources" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "messageId" uuid NOT NULL,
      "url" text,
      "title" character varying(255),
      "domain" character varying(255),
      "score" double precision,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_research_sources_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_research_sources_message" ON "research_sources" ("messageId")`);
    await queryRunner.query(`ALTER TABLE "research_sources" ADD CONSTRAINT "FK_research_sources_message" FOREIGN KEY ("messageId") REFERENCES "research_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "research_sources" DROP CONSTRAINT "FK_research_sources_message"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_research_sources_message"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_sources"`);

    await queryRunner.query(`ALTER TABLE "research_messages" DROP CONSTRAINT "FK_research_messages_session"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_research_messages_session_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_messages"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_research_sessions_user_updated"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "research_sessions"`);
  }
}














