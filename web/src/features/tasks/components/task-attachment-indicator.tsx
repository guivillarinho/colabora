import { Paperclip } from 'lucide-react'

export function TaskAttachmentIndicator({ count }: { count: number }) {
  if (count === 0) return null

  const label = count === 1 ? '1 arquivo anexado' : `${count} arquivos anexados`

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center text-muted-foreground"
    >
      <Paperclip aria-hidden="true" className="size-4" />
    </span>
  )
}
