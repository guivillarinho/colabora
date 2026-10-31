import type { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialSchema1793448000000 implements MigrationInterface {
  name = 'InitialSchema1793448000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(120) NOT NULL,
        description text,
        category varchar(40) NOT NULL,
        priority varchar(20) NOT NULL DEFAULT 'medium',
        color varchar(20) NOT NULL,
        "dueDate" timestamptz,
        location varchar(200),
        attachments jsonb NOT NULL DEFAULT '[]',
        "estimatedTime" integer NOT NULL,
        "actualTime" integer,
        status varchar(20) NOT NULL DEFAULT 'pending',
        "startedAt" timestamptz,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agenda_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(120) NOT NULL,
        type varchar(20) NOT NULL,
        description text,
        "startDate" timestamptz NOT NULL,
        "endDate" timestamptz NOT NULL,
        location varchar(200),
        attachments jsonb NOT NULL DEFAULT '[]',
        icon varchar(40),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS focus_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(120) NOT NULL DEFAULT 'Foco livre',
        "startedAt" timestamptz NOT NULL,
        "endedAt" timestamptz,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `)
  }

  async down(): Promise<void> {
    throw new Error(
      'A migração inicial não remove tabelas automaticamente. Restaure um backup para reverter.',
    )
  }
}
