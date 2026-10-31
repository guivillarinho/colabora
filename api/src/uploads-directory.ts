import { join } from 'node:path'

export function uploadsDirectory(): string {
  return (
    process.env.UPLOADS_DIRECTORY || join(process.cwd(), 'uploads', 'agenda')
  )
}
