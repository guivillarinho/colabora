import type { MigrationInterface, QueryRunner } from 'typeorm'

export class ConfigurableReminders1794441600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE tasks ADD COLUMN "reminderOffsets" jsonb')
    await runner.query(
      'ALTER TABLE agenda_items ADD COLUMN "reminderOffsets" jsonb',
    )
    await runner.query(`
      ALTER TABLE task_reminders
        ALTER COLUMN "taskId" DROP NOT NULL,
        ADD COLUMN "agendaItemId" uuid REFERENCES agenda_items(id) ON DELETE CASCADE,
        ADD CONSTRAINT task_reminders_one_source CHECK (num_nonnulls("taskId", "agendaItemId") = 1),
        ADD CONSTRAINT task_reminders_agenda_dedupe UNIQUE ("agendaItemId", "userId", kind, "scheduledAt")
    `)
  }

  async down(): Promise<void> {
    throw new Error('A reversão removeria configurações e lembretes da agenda.')
  }
}
