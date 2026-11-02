import type { MigrationInterface, QueryRunner } from 'typeorm'

export class PushNotifications1793620800000 implements MigrationInterface {
  name = 'PushNotifications1793620800000'

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE push_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint text NOT NULL UNIQUE,
        p256dh varchar(200) NOT NULL,
        auth varchar(100) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `)
    await runner.query(
      `CREATE INDEX push_subscriptions_user ON push_subscriptions ("userId")`,
    )
    await runner.query(`
      CREATE TABLE task_reminders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "taskId" uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind varchar(10) NOT NULL CHECK (kind IN ('before', 'due')),
        "scheduledAt" timestamptz NOT NULL,
        status varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent')),
        attempts integer NOT NULL DEFAULT 0,
        "sentAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("taskId", "userId", kind, "scheduledAt")
      )
    `)
    await runner.query(
      `CREATE INDEX task_reminders_queue ON task_reminders (status, "scheduledAt")`,
    )
    await runner.query(`
      INSERT INTO task_reminders ("taskId", "userId", kind, "scheduledAt")
      SELECT tasks.id, COALESCE(tasks."assignedToId", tasks."createdById"), reminders.kind,
        reminders."scheduledAt"
      FROM tasks
      CROSS JOIN LATERAL (VALUES
        ('before'::varchar, tasks."dueDate" - interval '10 minutes'),
        ('due'::varchar, tasks."dueDate")
      ) AS reminders(kind, "scheduledAt")
      WHERE tasks."dueDate" IS NOT NULL
        AND tasks.status <> 'completed'
        AND COALESCE(tasks."assignedToId", tasks."createdById") IS NOT NULL
        AND reminders."scheduledAt" > now()
      ON CONFLICT ("taskId", "userId", kind, "scheduledAt") DO NOTHING
    `)
  }

  async down(): Promise<void> {
    throw new Error(
      'A migração de notificações não remove inscrições nem lembretes automaticamente.',
    )
  }
}
