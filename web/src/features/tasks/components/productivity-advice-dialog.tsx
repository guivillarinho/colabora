import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ProductivityAdviceDialogProps = {
  advice: string | null
  onClose: () => void
}

export function ProductivityAdviceDialog({
  advice,
  onClose,
}: ProductivityAdviceDialogProps) {
  return (
    <Dialog
      open={advice !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conselho de produtividade</DialogTitle>
          <DialogDescription>
            {advice ?? 'A tarefa ficou dentro do tempo previsto.'}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
