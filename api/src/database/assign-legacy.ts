import 'reflect-metadata'
import { DataSource } from 'typeorm'

export async function assignLegacy(
  source: DataSource,
  userId: string,
  email: string,
) {
  return source.transaction(async (manager) => {
    const users: Array<{ id: string }> = await manager.query(
      'SELECT id FROM users WHERE id = $1 AND email = $2 FOR UPDATE',
      [userId, email.trim().toLowerCase()],
    )
    if (users.length !== 1)
      throw new Error(
        'Confirme a identidade, o ID e o e-mail da conta antes de vincular dados antigos.',
      )
    const tasks: [unknown[], number] = await manager.query(
      'UPDATE tasks SET "createdById" = $1, "assignedToId" = COALESCE("assignedToId", $1) WHERE "createdById" IS NULL RETURNING id',
      [userId],
    )
    const agenda: [unknown[], number] = await manager.query(
      'UPDATE agenda_items SET "ownerId" = $1 WHERE "ownerId" IS NULL RETURNING id',
      [userId],
    )
    const sessions: [unknown[], number] = await manager.query(
      'UPDATE focus_sessions SET "ownerId" = $1 WHERE "ownerId" IS NULL RETURNING id',
      [userId],
    )
    await manager.query(
      `INSERT INTO attachments (filename, "ownerId", "storagePath")
      SELECT DISTINCT split_part(reference, '||/uploads/agenda/', 2), $1, 'agenda/' || split_part(reference, '||/uploads/agenda/', 2)
      FROM (SELECT jsonb_array_elements_text(attachments) AS reference FROM tasks WHERE "createdById" = $1 UNION ALL SELECT jsonb_array_elements_text(attachments) AS reference FROM agenda_items WHERE "ownerId" = $1) refs
      WHERE reference ~ '^[^|]+[|][|]/uploads/agenda/[0-9a-f-]{36}[.](pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$'
      ON CONFLICT (filename) DO NOTHING`,
      [userId],
    )
    return {
      tasks: tasks[1],
      agenda: agenda[1],
      sessions: sessions[1],
    }
  })
}

async function main() {
  const args = process.argv.slice(2)
  const userId = args[args.indexOf('--user-id') + 1]
  const email = args[args.indexOf('--email') + 1]
  if (
    !args.includes('--confirm') ||
    !/^[0-9a-f-]{36}$/i.test(userId ?? '') ||
    !email?.includes('@') ||
    !process.env.DATABASE_URL
  )
    throw new Error(
      'Informe DATABASE_URL, --user-id, --email e --confirm após verificar a conta de destino.',
    )
  const source = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    ssl:
      process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  })
  await source.initialize()
  try {
    console.log(await assignLegacy(source, userId, email))
  } finally {
    await source.destroy()
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      'Vinculação não realizada. Verifique a conta, a conexão e se já existe uma sessão de foco ativa para o usuário.',
    )
    process.exitCode = 1
  })
