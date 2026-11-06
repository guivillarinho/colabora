import type { MigrationInterface, QueryRunner } from 'typeorm'

export class UserAvatar1794096000000 implements MigrationInterface {
  name = 'UserAvatar1794096000000'

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE users ADD COLUMN "avatarKey" varchar(120)`)
    await runner.query(
      `ALTER TABLE users ADD CONSTRAINT users_avatar_key CHECK ("avatarKey" IS NULL OR "avatarKey" ~ '^preset:(violet|leaf|wave|sun|ember)$' OR "avatarKey" ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpe?g|webp)$')`,
    )
  }

  async down(): Promise<void> {
    throw new Error(
      'Esta migração não remove fotos de perfil automaticamente. Restaure um backup validado para reverter.',
    )
  }
}
