import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type DeleteConfirmationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: string
  name: string
  onConfirm: () => void | Promise<void>
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  entity,
  name,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  function changeOpen(value: boolean) {
    if (submitting.current) return
    setError(null)
    onOpenChange(value)
  }

  async function confirm() {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível excluir. Tente novamente.',
      )
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent aria-busy={pending}>
        <DialogHeader>
          <DialogTitle>Excluir {entity}?</DialogTitle>
          <DialogDescription>
            Tem certeza de que deseja excluir “{name}”? Essa ação não pode ser
            desfeita.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => changeOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {pending ? 'Excluindo...' : 'Confirmar exclusão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
