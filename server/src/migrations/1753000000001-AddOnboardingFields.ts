import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingFields1753000000001 implements MigrationInterface {
  name = 'AddOnboardingFields1753000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "usagePurpose" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "userType" character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "userType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "usagePurpose"`,
    );
  }
} 