import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1752751877219 implements MigrationInterface {
    name = 'AutoMigration1752751877219'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."users_role_enum" AS ENUM('student', 'teacher', 'admin')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."users_status_enum" AS ENUM(
                'active',
                'inactive',
                'suspended',
                'pending_verification'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "fullName" character varying(255) NOT NULL,
                "email" character varying(255) NOT NULL,
                "password" character varying(255) NOT NULL,
                "role" "public"."users_role_enum" NOT NULL DEFAULT 'student',
                "status" "public"."users_status_enum" NOT NULL DEFAULT 'pending_verification',
                "emailVerified" boolean NOT NULL DEFAULT false,
                "emailVerificationToken" character varying(255),
                "emailVerificationExpires" TIMESTAMP,
                "passwordResetToken" character varying(255),
                "passwordResetExpires" TIMESTAMP,
                "lastLoginAt" TIMESTAMP,
                "lastPasswordChangeAt" TIMESTAMP,
                "loginAttempts" integer NOT NULL DEFAULT '0',
                "lockedUntil" TIMESTAMP,
                "preferences" jsonb NOT NULL DEFAULT '{}',
                "profile" jsonb NOT NULL DEFAULT '{}',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."users_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."users_role_enum"
        `);
    }

}
