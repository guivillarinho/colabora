import type { MigrationInterface, QueryRunner } from 'typeorm'

export class PasswordReset1793707200000 implements MigrationInterface {
  name = 'PasswordReset1793707200000'

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "tokenHash" char(64) NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `)
    await runner.query(
      `CREATE INDEX password_reset_tokens_user_expiry ON password_reset_tokens ("userId", "expiresAt")`,
    )
  }

  async down(): Promise<void> {
    throw new Error(
      'Esta migração preserva tokens para auditoria operacional. Restaure um backup validado para reverter.',
    )
  }
}
