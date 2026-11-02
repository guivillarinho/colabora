import type { MigrationInterface, QueryRunner } from 'typeorm'

export class UserSecurity1793534400000 implements MigrationInterface {
  name = 'UserSecurity1793534400000'

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(80) NOT NULL, email varchar(254) NOT NULL UNIQUE, "passwordHash" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT users_email_normalized CHECK (email = lower(trim(email))))`,
    )
    await runner.query(`CREATE INDEX users_name_lookup ON users (lower(name))`)
    await runner.query(
      `CREATE TABLE app_sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp NOT NULL)`,
    )
    await runner.query(
      `CREATE INDEX app_sessions_expire ON app_sessions (expire)`,
    )
    await runner.query(
      `CREATE TABLE revoked_sessions (id varchar(64) PRIMARY KEY, "expiresAt" timestamptz NOT NULL)`,
    )
    await runner.query(
      `CREATE INDEX revoked_sessions_expiry ON revoked_sessions ("expiresAt")`,
    )
    await runner.query(
      `CREATE TABLE auth_rate_limits (key varchar(64) PRIMARY KEY, hits integer NOT NULL, "resetAt" timestamptz NOT NULL)`,
    )
    await runner.query(
      `CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits ("resetAt")`,
    )
    await runner.query(
      `ALTER TABLE tasks ADD COLUMN "createdById" uuid REFERENCES users(id) ON DELETE RESTRICT, ADD COLUMN "assignedToId" uuid REFERENCES users(id) ON DELETE SET NULL`,
    )
    await runner.query(
      `CREATE INDEX tasks_creator ON tasks ("createdById", "createdAt")`,
    )
    await runner.query(
      `CREATE INDEX tasks_assignee ON tasks ("assignedToId", "createdAt")`,
    )
    await runner.query(
      `ALTER TABLE agenda_items ADD COLUMN "ownerId" uuid REFERENCES users(id) ON DELETE RESTRICT`,
    )
    await runner.query(
      `CREATE INDEX agenda_owner ON agenda_items ("ownerId", "startDate")`,
    )
    await runner.query(
      `ALTER TABLE focus_sessions ADD COLUMN "ownerId" uuid REFERENCES users(id) ON DELETE RESTRICT`,
    )
    await runner.query(
      `CREATE INDEX focus_owner ON focus_sessions ("ownerId", "startedAt")`,
    )
    await runner.query(
      `CREATE UNIQUE INDEX focus_one_active_per_user ON focus_sessions ("ownerId") WHERE "endedAt" IS NULL AND "ownerId" IS NOT NULL`,
    )
    await runner.query(
      `CREATE TABLE attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename varchar(80) NOT NULL UNIQUE, "ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, "storagePath" varchar(200) NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`,
    )
    await runner.query(
      `CREATE INDEX attachments_owner ON attachments ("ownerId")`,
    )
  }

  async down(): Promise<void> {
    throw new Error(
      'Esta migração de segurança não remove usuários nem propriedade automaticamente. Restaure um backup validado para reverter.',
    )
  }
}
