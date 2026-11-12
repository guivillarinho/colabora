import type { MigrationInterface, QueryRunner } from 'typeorm'

export class GoogleResourceId1796100000000 implements MigrationInterface {
  name = 'GoogleResourceId1796100000000'

  async up(runner: QueryRunner) {
    await runner.query(
      'ALTER TABLE google_sync_links ALTER COLUMN "googleResourceId" TYPE varchar(1024)',
    )
  }

  async down() {
    throw new Error('Esta migração não pode ser revertida.')
  }
}
