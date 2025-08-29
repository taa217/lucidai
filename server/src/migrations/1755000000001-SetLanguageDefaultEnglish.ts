import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetLanguageDefaultEnglish1755000000001 implements MigrationInterface {
  name = 'SetLanguageDefaultEnglish1755000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update existing rows where language is 'en' or null to 'English'
    await queryRunner.query(`
      UPDATE "user_preferences"
      SET "language" = 'English'
      WHERE COALESCE(TRIM("language"), '') IN ('', 'en')
    `);

    // Change column default to 'English'
    await queryRunner.query(`
      ALTER TABLE "user_preferences" ALTER COLUMN "language" SET DEFAULT 'English'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert default to 'en'
    await queryRunner.query(`
      ALTER TABLE "user_preferences" ALTER COLUMN "language" SET DEFAULT 'en'
    `);

    // Optionally map 'English' back to 'en' (best-effort)
    await queryRunner.query(`
      UPDATE "user_preferences" SET "language" = 'en' WHERE "language" = 'English'
    `);
  }
}





























