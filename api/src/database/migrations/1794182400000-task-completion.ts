import type { MigrationInterface, QueryRunner } from 'typeorm'

export class TaskCompletion1794182400000 implements MigrationInterface {
  name = 'TaskCompletion1794182400000'

  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE tasks ADD COLUMN "completedAt" timestamptz')
    await runner.query(
      'ALTER TABLE tasks ADD COLUMN timed boolean NOT NULL DEFAULT false',
    )
    await runner.query(
      `UPDATE tasks SET timed = true WHERE "dueDate" IS NULL AND "startedAt" IS NOT NULL`,
    )
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE tasks DROP COLUMN timed')
    await runner.query('ALTER TABLE tasks DROP COLUMN "completedAt"')
  }
}
