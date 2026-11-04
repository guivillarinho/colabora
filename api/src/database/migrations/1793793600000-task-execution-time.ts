import type { MigrationInterface, QueryRunner } from 'typeorm'

export class TaskExecutionTime1793793600000 implements MigrationInterface {
  name = 'TaskExecutionTime1793793600000'

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE tasks ADD COLUMN "actualTimeSource" varchar(16)',
    )
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE tasks DROP COLUMN "actualTimeSource"')
  }
}
