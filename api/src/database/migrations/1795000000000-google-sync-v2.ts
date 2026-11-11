import type { MigrationInterface, QueryRunner } from 'typeorm'

export class GoogleSyncV21795000000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`ALTER TABLE google_connections
      ADD COLUMN preferences jsonb NOT NULL DEFAULT '{"autoSync":false,"inboundEnabled":false,"defaultCalendarId":"primary","categoryTaskListMap":{}}'::jsonb,
      ADD COLUMN "tasksPolledAt" timestamptz,
      ADD COLUMN "lastError" jsonb`)
    await runner.query(`CREATE TABLE google_sync_links (
      "ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "entityType" varchar(20) NOT NULL,
      "entityId" uuid NOT NULL,
      "googleKind" varchar(20) NOT NULL,
      "googleResourceId" varchar(128) NOT NULL,
      "googleCalendarId" varchar(256),
      "googleEtag" varchar(256),
      "colaboraRevision" timestamptz,
      "syncedAt" timestamptz NOT NULL DEFAULT now(),
      "syncState" varchar(20) NOT NULL DEFAULT 'pending',
      PRIMARY KEY ("ownerId", "entityType", "entityId")
    )`)
    await runner.query(
      `CREATE INDEX google_sync_links_resource ON google_sync_links ("ownerId", "googleKind", "googleResourceId")`,
    )
    await runner.query(`INSERT INTO google_sync_links
      ("ownerId","entityType","entityId","googleKind","googleResourceId","googleCalendarId","syncState","syncedAt")
      SELECT "ownerId", 'task', "taskId", 'event', "eventId", 'primary', 'pending', "syncedAt"
      FROM google_calendar_sync
      ON CONFLICT DO NOTHING`)
    await runner.query(`CREATE TABLE google_watch_channels (
      "channelId" uuid PRIMARY KEY,
      "ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "calendarId" varchar(256) NOT NULL,
      "resourceId" varchar(256),
      token varchar(128) NOT NULL,
      expiration timestamptz,
      "syncToken" text,
      UNIQUE ("ownerId", "calendarId")
    )`)
    await runner.query(`CREATE TABLE google_sync_outbox (
      id uuid PRIMARY KEY,
      "ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation varchar(40) NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      attempts int NOT NULL DEFAULT 0,
      "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
      "lastError" text,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`)
    await runner.query(
      `CREATE INDEX google_sync_outbox_due ON google_sync_outbox ("nextAttemptAt")`,
    )
  }

  async down() {
    throw new Error('Reversão requer revisão para preservar vínculos Google.')
  }
}
