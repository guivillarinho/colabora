import { Paperclip } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function AttachmentPicker({
  id,
  children,
  disabled,
  onChoose,
}: {
  id: string
  children?: ReactNode
  disabled?: boolean
  onChoose: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>Anexos</Label>
      {children}
      <input
        ref={input}
        className="sr-only"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
        disabled={disabled}
        id={id}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) onChoose(file)
        }}
      />
      <Button
        className="h-11 w-full bg-muted text-black hover:bg-muted/80 dark:text-foreground"
        disabled={disabled}
        type="button"
        variant="outline"
        onClick={() => input.current?.click()}
      >
        <Paperclip aria-hidden="true" />
        Escolher arquivo
      </Button>
    </div>
  )
}
