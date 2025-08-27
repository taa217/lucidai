import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentTables1710000000000 implements MigrationInterface {
  name = 'CreateDocumentTables1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create document_type_enum
    await queryRunner.query(`
      CREATE TYPE "public"."document_type_enum" AS ENUM(
        'pdf', 'docx', 'txt', 'epub', 'image', 'video', 'audio', 'other'
      )
    `);

    // Create document_status_enum
    await queryRunner.query(`
      CREATE TYPE "public"."document_status_enum" AS ENUM(
        'uploaded', 'processing', 'completed', 'failed', 'deleted'
      )
    `);

    // Create user_documents table
    await queryRunner.query(`
      CREATE TABLE "user_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "filename" character varying(255) NOT NULL,
        "originalFilename" character varying(255) NOT NULL,
        "fileSize" bigint NOT NULL,
        "mimeType" character varying(100) NOT NULL,
        "documentType" "public"."document_type_enum" NOT NULL DEFAULT 'other',
        "status" "public"."document_status_enum" NOT NULL DEFAULT 'uploaded',
        "uploadDate" TIMESTAMP NOT NULL DEFAULT now(),
        "tags" text array NOT NULL DEFAULT '{}',
        "isPublic" boolean NOT NULL DEFAULT false,
        "thumbnailPath" character varying(500),
        "storagePath" character varying(500),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "extractedText" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_documents" PRIMARY KEY ("id")
      )
    `);

    // Create document_collections table
    await queryRunner.query(`
      CREATE TABLE "document_collections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text,
        "color" character varying(7) NOT NULL DEFAULT '#3B82F6',
        "isPublic" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_collections" PRIMARY KEY ("id")
      )
    `);

    // Create document_collection_items junction table
    await queryRunner.query(`
      CREATE TABLE "document_collection_items" (
        "collectionId" uuid NOT NULL,
        "documentId" uuid NOT NULL,
        CONSTRAINT "PK_document_collection_items" PRIMARY KEY ("collectionId", "documentId")
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "user_documents" 
      ADD CONSTRAINT "FK_user_documents_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "document_collections" 
      ADD CONSTRAINT "FK_document_collections_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "document_collection_items" 
      ADD CONSTRAINT "FK_document_collection_items_collection" 
      FOREIGN KEY ("collectionId") REFERENCES "document_collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "document_collection_items" 
      ADD CONSTRAINT "FK_document_collection_items_document" 
      FOREIGN KEY ("documentId") REFERENCES "user_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "IDX_user_documents_userId_status" ON "user_documents" ("userId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_documents_userId_uploadDate" ON "user_documents" ("userId", "uploadDate")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_documents_filename" ON "user_documents" ("filename")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_document_collections_userId" ON "document_collections" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_document_collection_items_collectionId" ON "document_collection_items" ("collectionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_document_collection_items_documentId" ON "document_collection_items" ("documentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_document_collection_items_documentId"`);
    await queryRunner.query(`DROP INDEX "IDX_document_collection_items_collectionId"`);
    await queryRunner.query(`DROP INDEX "IDX_document_collections_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_user_documents_filename"`);
    await queryRunner.query(`DROP INDEX "IDX_user_documents_userId_uploadDate"`);
    await queryRunner.query(`DROP INDEX "IDX_user_documents_userId_status"`);

    // Drop foreign key constraints
    await queryRunner.query(`ALTER TABLE "document_collection_items" DROP CONSTRAINT "FK_document_collection_items_document"`);
    await queryRunner.query(`ALTER TABLE "document_collection_items" DROP CONSTRAINT "FK_document_collection_items_collection"`);
    await queryRunner.query(`ALTER TABLE "document_collections" DROP CONSTRAINT "FK_document_collections_user"`);
    await queryRunner.query(`ALTER TABLE "user_documents" DROP CONSTRAINT "FK_user_documents_user"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "document_collection_items"`);
    await queryRunner.query(`DROP TABLE "document_collections"`);
    await queryRunner.query(`DROP TABLE "user_documents"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE "public"."document_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."document_type_enum"`);
  }
} 