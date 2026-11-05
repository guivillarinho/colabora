import type { MigrationInterface, QueryRunner } from 'typeorm'
export class GoogleCalendar1794009600000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`CREATE TABLE google_connections (
      "ownerId" uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version uuid NOT NULL, token text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'connected'
    )`)
    await runner.query(`CREATE TABLE google_calendar_sync (
      "ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "taskId" uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      "eventId" varchar(64) NOT NULL, "syncedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("ownerId", "taskId")
    )`)
  }

  async down() {
    throw new Error('Reversão requer revisão para preservar vínculos Google.')
  }
}
