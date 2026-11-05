import type { MigrationInterface, QueryRunner } from 'typeorm'
export class Assistant1793923200000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(
      'CREATE TABLE assistant_receipts (id uuid PRIMARY KEY, completed boolean NOT NULL DEFAULT false)',
    )
  }

  async down() {
    throw new Error(
      'Reversão requer revisão para preservar recibos de idempotência.',
    )
  }
}
