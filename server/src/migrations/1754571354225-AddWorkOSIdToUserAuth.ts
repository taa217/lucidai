import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkOSIdToUserAuth1754571354225 implements MigrationInterface {
    name = 'AddWorkOSIdToUserAuth1754571354225'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_auth" ADD "workosId" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_auth" DROP COLUMN "workosId"`);
    }
} 