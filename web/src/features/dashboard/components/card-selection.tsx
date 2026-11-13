import { useEffect, useRef } from 'react'
import { Circle, CircleCheck, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from 'cn'

export type CardSelection = {
  selected: ReadonlySet<string>
  toggle: (key: string) => void
  cancel: () => void
}

export function useCardHold() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }

  return {
    start(onHold: () => void) {
      cancel()
      held.current = false
      timer.current = setTimeout(() => {
        timer.current = null
        held.current = true
        onHold()
      }, 500)
    },
    cancel,
    consume() {
      const wasHeld = held.current
      held.current = false
      return wasHeld
    },
  }
}

export function SelectionCircle({ checked }: { checked: boolean }) {
  const Icon = checked ? CircleCheck : Circle
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'size-5 shrink-0',
        checked
          ? 'fill-primary text-primary-foreground stroke-[2.5]'
          : 'text-muted-foreground',
      )}
    />
  )
}

export function CardSelectionActions({
  count,
  allSelected,
  onToggleAll,
  onCancel,
  onDelete,
}: {
  count: number
  allSelected: boolean
  onToggleAll: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-3"
      aria-label="Seleção de itens"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected}
        className="flex min-h-11 items-center gap-2 text-sm font-medium"
        onClick={onToggleAll}
      >
        <SelectionCircle checked={allSelected} />
        Tudo
      </button>
      <span role="status" className="sr-only">
        {count} selecionado(s)
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cancelar seleção"
          onClick={onCancel}
        >
          <X aria-hidden="true" />
        </Button>
        <Button
          aria-label="Excluir selecionados"
          title="Excluir selecionados"
          className="size-11 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          size="icon"
          variant="outline"
          disabled={!count}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </div>
  )
}
