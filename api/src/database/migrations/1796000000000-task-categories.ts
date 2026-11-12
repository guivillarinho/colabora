import { MigrationInterface, QueryRunner } from 'typeorm'

export class TaskCategories1796000000000 implements MigrationInterface {
  name = 'TaskCategories1796000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name varchar(40) NOT NULL,
        color varchar(20) NOT NULL DEFAULT 'blue',
        "googleListId" varchar(128),
        "googleEtag" varchar(128),
        "syncState" varchar(20) NOT NULL DEFAULT 'pending',
        "deletedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT task_categories_owner_name_unique UNIQUE ("ownerId", name)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS task_categories_owner_idx ON task_categories ("ownerId")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS task_categories_google_list_idx ON task_categories ("googleListId") WHERE "googleListId" IS NOT NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "categoryId" uuid REFERENCES task_categories(id) ON DELETE SET NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS tasks_category_id_idx ON tasks ("categoryId")`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('Down migration is not supported.')
  }
}
