import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AttachmentContent1794096000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE attachments ADD COLUMN content bytea`)
    await runner.query(`CREATE TABLE attachment_uploads (
      id uuid PRIMARY KEY,
      "ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename varchar(80) NOT NULL UNIQUE,
      "originalName" varchar(180) NOT NULL,
      "totalParts" integer NOT NULL,
      "nextPart" integer NOT NULL,
      "byteSize" integer NOT NULL,
      content bytea NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT attachment_uploads_parts CHECK ("totalParts" BETWEEN 1 AND 8 AND "nextPart" BETWEEN 0 AND "totalParts"),
      CONSTRAINT attachment_uploads_size CHECK ("byteSize" BETWEEN 0 AND 10485760)
    )`)
    await runner.query(
      `CREATE INDEX attachment_uploads_created ON attachment_uploads ("createdAt")`,
    )
  }

  async down(): Promise<void> {
    throw new Error(
      'Reversão apagaria o conteúdo dos anexos. Restaure um backup validado para reverter.',
    )
  }
}
