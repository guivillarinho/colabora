import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AccountPreferences1794355200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{"theme":"system","palette":"purple"}'`,
    )
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE users DROP COLUMN preferences')
  }
}
