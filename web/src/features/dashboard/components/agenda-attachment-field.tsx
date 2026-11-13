import { useId, useState } from 'react'

import { AttachmentPicker } from '@/components/attachment-picker'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { attachmentReference } from '@/features/tasks/components/attachment-reference'
import { addAgendaAttachment, type AgendaItem } from '../agenda-items'
import { uploadAgendaFiles } from '../upload-agenda-files'

export function AgendaAttachmentField({
  itemId,
  count,
  onSaved,
}: {
  itemId: string
  count: number
  onSaved: (item: AgendaItem) => void
}) {
  const id = useId()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingReference, setPendingReference] = useState<string | null>(null)

  async function save(file?: File) {
    setBusy(true)
    setError('')
    try {
      let reference = pendingReference
      if (file && user) {
        setPendingReference(null)
        const [uploaded] = await uploadAgendaFiles([file], user.id)
        if (uploaded) {
          reference = attachmentReference(uploaded.name, uploaded.url)
          setPendingReference(reference)
        }
      }
      if (!reference) throw new Error('Não foi possível enviar o arquivo.')
      const saved = await addAgendaAttachment(itemId, reference)
      setPendingReference(null)
      onSaved(saved)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível anexar o arquivo.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <AttachmentPicker
        id={id}
        disabled={!user || busy || count >= 10}
        onChoose={save}
      />
      {count >= 10 ? (
        <p className="text-muted-foreground">Limite de 10 arquivos por item.</p>
      ) : null}
      {busy ? <p role="status">Anexando arquivo...</p> : null}
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {error && pendingReference ? (
        <Button onClick={() => save()} type="button" variant="outline">
          Tentar salvar anexo novamente
        </Button>
      ) : null}
    </div>
  )
}
