import type { MigrationInterface, QueryRunner } from 'typeorm'

export class Pomodoro1793880000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE focus_sessions ADD COLUMN "focusMinutes" integer, ADD COLUMN "breakMinutes" integer',
    )
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE focus_sessions DROP COLUMN "focusMinutes", DROP COLUMN "breakMinutes"',
    )
  }
}
