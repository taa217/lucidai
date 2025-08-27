import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateChatTables1756000000000 implements MigrationInterface {
  name = 'CreateChatTables1756000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "chat_sessions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "docId" uuid,
      "title" character varying(255),
      "modelProvider" character varying(50),
      "messageCount" integer NOT NULL DEFAULT 0,
      "lastMessageAt" TIMESTAMP,
      "lastMessagePreview" character varying(300),
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_chat_sessions_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_sessions_user_updated" ON "chat_sessions" ("userId", "updatedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_sessions_user_doc_updated" ON "chat_sessions" ("userId", "docId", "updatedAt")`);

    await queryRunner.query(`ALTER TABLE "chat_sessions" ADD CONSTRAINT "FK_chat_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "chat_sessions" ADD CONSTRAINT "FK_chat_sessions_doc" FOREIGN KEY ("docId") REFERENCES "user_documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "chat_messages" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "sessionId" uuid NOT NULL,
      "userId" uuid NOT NULL,
      "role" character varying(20) NOT NULL,
      "content" text NOT NULL,
      "metadata" jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_chat_messages_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_messages_session_created" ON "chat_messages" ("sessionId", "createdAt")`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_chat_messages_session" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_chat_messages_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "FK_chat_messages_user"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "FK_chat_messages_session"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_session_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);

    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP CONSTRAINT IF EXISTS "FK_chat_sessions_doc"`);
    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP CONSTRAINT IF EXISTS "FK_chat_sessions_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_sessions_user_doc_updated"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_sessions_user_updated"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions"`);
  }
}


