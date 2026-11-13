import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { useAuth } from '@/features/auth/auth-context'
import { uploadAgendaFiles } from '@/features/dashboard/upload-agenda-files'
import { AttachmentPicker } from '@/components/attachment-picker'
import { cn } from 'cn'
import { attachmentReference, parseAttachment } from './attachment-reference'

type AttachmentFieldProps = {
  id: string
  initialReference?: string | null
  onChange: (reference: string | null) => void
  onPendingChange?: (pending: boolean) => void
}

export function persistedAttachment(
  value: string | null | undefined,
): string | null {
  return parseAttachment(value).url ? value! : null
}

export function attachmentLabel(reference: string): string {
  return reference.split('||')[0] ?? reference
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
  initialReference,
  onChange,
  onPendingChange,
}: AttachmentFieldProps) {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [keptReference, setKeptReference] = useState(
    persistedAttachment(initialReference) ?? '',
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const name = attachmentLabel(keptReference)
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

  async function chooseFile(next: File) {
    const current = ++request.current
    setError(null)
    setUploading(true)
    onPendingChange?.(true)
    try {
      if (!user) throw new Error('Entre na conta para anexar um arquivo.')
      const [uploaded] = await uploadAgendaFiles([next], user.id)
      if (current !== request.current) return
      if (!uploaded?.url.startsWith('/uploads/agenda/')) {
        throw new Error('Não foi possível enviar o anexo.')
      }
      const reference = attachmentReference(uploaded.name, uploaded.url)
      setFile(next)
      setKeptReference(reference)
      onChange(reference)
    } catch (cause) {
      if (current !== request.current) return
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível enviar o anexo.',
      )
    } finally {
      if (current === request.current) {
        setUploading(false)
        onPendingChange?.(false)
      }
    }
  }

  function removeFile() {
    request.current += 1
    setFile(null)
    setKeptReference('')
    setError(null)
    setUploading(false)
    onPendingChange?.(false)
    setConfirming(false)
    onChange(null)
  }

  return (
    <div className="grid min-w-0 gap-2">
      <AttachmentPicker id={id} disabled={uploading} onChoose={chooseFile}>
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
              <p
                className={cn('text-xs font-medium uppercase', toneClass[tone])}
              >
                {extension || 'arquivo'}
              </p>
            </div>
            <Button
              aria-label="Excluir anexo"
              disabled={uploading}
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
      </AttachmentPicker>
      {uploading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Enviando anexo...
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
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
