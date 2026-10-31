import { Paperclip, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { Label } from '@/components/ui/label'
import { cn } from 'cn'

type AttachmentFieldProps = {
  id: string
  initialName?: string | null
  onChange: (name: string | null) => void
}

type FileTone = 'pdf' | 'word' | 'excel' | 'other'

const toneClass: Record<FileTone, string> = {
  pdf: 'text-red-700',
  word: 'text-blue-700',
  excel: 'text-green-700',
  other: 'text-neutral-950 dark:text-neutral-50',
}

export function AttachmentField({
  id,
  initialName,
  onChange,
}: AttachmentFieldProps) {
  const [file, setFile] = useState<File | null>(null)
  const [keptName, setKeptName] = useState(initialName ?? '')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const name = file?.name || keptName
  const extension = fileExtension(name)
  const tone = fileTone(extension)

  useEffect(() => {
    if (!file || !canPreview(file)) {
      setPreviewUrl(null)
      return
    }

    if (!isPdfFile(file)) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)

      return () => {
        URL.revokeObjectURL(url)
      }
    }

    let active = true

    import('./pdf-preview')
      .then(({ renderPdfPreview }) => renderPdfPreview(file))
      .then((url) => {
        if (active) {
          setPreviewUrl(url)
        }
      })
      .catch(() => {
        if (active) {
          setPreviewUrl(null)
        }
      })

    return () => {
      active = false
    }
  }, [file])

  function chooseFile(next: File | null) {
    setFile(next)
    setKeptName('')
    onChange(next?.name ?? null)
  }

  function removeFile() {
    setFile(null)
    setKeptName('')
    setConfirming(false)
    setInputKey((current) => current + 1)
    onChange(null)
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>Anexos</Label>
      {name ? (
        <div className="flex h-28 w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border p-3">
          <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
            {previewUrl ? (
              <img
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-top"
                src={previewUrl}
              />
            ) : (
              <span
                className={cn(
                  'absolute inset-0 flex items-center justify-center text-xs font-semibold',
                  toneClass[tone],
                )}
              >
                {extension || 'ARQ'}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate font-semibold">{shortFileName(name)}</p>
            <p className={cn('text-xs font-medium uppercase', toneClass[tone])}>
              {extension || 'arquivo'}
            </p>
          </div>
          <Button
            aria-label="Excluir anexo"
            size="icon"
            type="button"
            variant="destructive"
            onClick={() => {
              setConfirming(true)
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ) : null}
      <input
        key={inputKey}
        ref={inputRef}
        className="sr-only"
        id={id}
        type="file"
        onChange={(event) => {
          chooseFile(event.target.files?.[0] ?? null)
        }}
      />
      <Button
        className="h-11 w-full bg-muted text-black hover:bg-muted/80 dark:text-foreground"
        type="button"
        variant="outline"
        onClick={() => {
          inputRef.current?.click()
        }}
      >
        <Paperclip />
        Escolher arquivo
      </Button>
      <DeleteConfirmationDialog
        open={confirming}
        onOpenChange={setConfirming}
        entity="anexo"
        name={name}
        onConfirm={removeFile}
      />
    </div>
  )
}

function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  )
}

function canPreview(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
}

function shortFileName(name: string): string {
  const extension = fileExtension(name)
  const base = extension ? name.slice(0, -(extension.length + 1)) : name

  if (name.length <= 22) {
    return name
  }

  const prefix = base.slice(0, 14).trim()

  return extension ? `${prefix}….${extension}` : `${prefix}…`
}

function fileExtension(name: string): string {
  const parts = name.split('.')

  if (parts.length < 2) {
    return ''
  }

  return parts.at(-1)?.toLowerCase() ?? ''
}

function fileTone(extension: string): FileTone {
  if (extension === 'pdf') {
    return 'pdf'
  }

  if (extension === 'doc' || extension === 'docx') {
    return 'word'
  }

  if (extension === 'xls' || extension === 'xlsx' || extension === 'csv') {
    return 'excel'
  }

  return 'other'
}
