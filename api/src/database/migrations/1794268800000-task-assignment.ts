import type { MigrationInterface, QueryRunner } from 'typeorm'

export class TaskAssignment1794268800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE tasks ADD COLUMN "assignmentStatus" varchar(16) NOT NULL DEFAULT 'accepted' CHECK ("assignmentStatus" IN ('pending', 'accepted', 'declined'))`,
    )
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE tasks DROP COLUMN "assignmentStatus"')
  }
}
