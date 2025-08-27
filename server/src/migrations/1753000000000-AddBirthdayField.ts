import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBirthdayField1753000000000 implements MigrationInterface {
  name = 'AddBirthdayField1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "birthday" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "birthday"`,
    );
  }
} 