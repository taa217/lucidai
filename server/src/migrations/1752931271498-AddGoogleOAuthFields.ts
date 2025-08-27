import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGoogleOAuthFields1752931271498 implements MigrationInterface {
    name = 'AddGoogleOAuthFields1752931271498'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "googleId" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "picture" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "picture"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "googleId"`);
    }

}
