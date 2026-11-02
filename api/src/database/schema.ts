export function databaseSchema(value = 'public'): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value))
    throw new Error('DB_SCHEMA inválido.')
  return value
}
