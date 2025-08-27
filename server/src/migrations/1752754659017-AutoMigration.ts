import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1752754659017 implements MigrationInterface {
    name = 'AutoMigration1752754659017'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "emailVerificationCode" character varying(255)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "emailVerificationCode"
        `);
    }

}
