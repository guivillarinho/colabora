import type { MigrationInterface, QueryRunner } from 'typeorm'

export class GoogleDriveAttachments1796200000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`CREATE TABLE google_drive_attachments (
      "attachmentId" uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
      "googleSubject" varchar(255) NOT NULL,
      "driveFileId" varchar(255) NOT NULL,
      PRIMARY KEY ("attachmentId", "googleSubject")
    )`)
  }

  async down(runner: QueryRunner) {
    await runner.query('DROP TABLE google_drive_attachments')
  }
}
