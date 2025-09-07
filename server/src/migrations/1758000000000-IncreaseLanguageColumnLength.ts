import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreaseLanguageColumnLength1758000000000 implements MigrationInterface {
  name = 'IncreaseLanguageColumnLength1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Increase language column length from 10 to 200 characters
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ALTER COLUMN "language" TYPE character varying(200)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert language column length back to 10 characters
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ALTER COLUMN "language" TYPE character varying(10)
    `);
  }
}
