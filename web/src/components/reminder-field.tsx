import { Bell, ChevronDown, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const units = [
  { minutes: 1, label: 'Minutos', singular: 'minuto', plural: 'minutos' },
  { minutes: 60, label: 'Horas', singular: 'hora', plural: 'horas' },
  { minutes: 1440, label: 'Dias', singular: 'dia', plural: 'dias' },
] as const
const presets = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]
const maxOffset = 28 * 1440
const maxReminders = 5

export function isFutureReminder(
  start: string,
  minutes: number,
  now = Date.now(),
) {
  return new Date(start).getTime() - minutes * 60_000 > now
}

function describeReminder(minutes: number) {
  if (minutes === 0) return 'No horário marcado'
  const unit = units.findLast((option) => minutes % option.minutes === 0)!
  const count = minutes / unit.minutes
  return `${count} ${count === 1 ? unit.singular : unit.plural} antes`
}

export function ReminderField({
  start,
  value,
  onChange,
}: {
  start: string
  value: number[]
  onChange: (value: number[]) => void
}) {
  const id = useId()
  const [now, setNow] = useState(Date.now)
  const trigger = useRef<HTMLButtonElement>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [amount, setAmount] = useState('10')
  const [unit, setUnit] = useState(1)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const currentTime = now
  const canAdd =
    value.length < maxReminders && isFutureReminder(start, 0, currentTime)
  const allowed = (minutes: number, clock = currentTime) =>
    canAdd &&
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes <= maxOffset &&
    !value.includes(minutes) &&
    isFutureReminder(start, minutes, clock)
  const customOffset = Number(amount) * unit

  function closeOptions() {
    setOptionsOpen(false)
    trigger.current?.focus()
  }

  function add(minutes: number) {
    if (!allowed(minutes, Date.now())) return
    onChange([...value, minutes].sort((a, b) => b - a))
    setCustom(false)
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>
        <Bell aria-hidden="true" className="size-4" />
        Lembretes
      </Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((minutes) => (
            <li
              key={minutes}
              className="flex items-center rounded-lg bg-muted pl-3 text-sm"
            >
              {describeReminder(minutes)}
              <Button
                aria-label={`Remover lembrete: ${describeReminder(minutes)}`}
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  onChange(value.filter((offset) => offset !== minutes))
                }
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Collapsible open={optionsOpen && canAdd} onOpenChange={setOptionsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            ref={trigger}
            id={id}
            type="button"
            variant="outline"
            className="min-h-11 w-full justify-between px-3"
            aria-describedby={`${id}-hint`}
            disabled={!canAdd}
          >
            Adicionar lembrete
            <ChevronDown
              aria-hidden="true"
              className="group-aria-expanded/button:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid grid-cols-2 gap-2 rounded-xl border bg-card p-2">
          {presets.map((minutes) => (
            <Button
              key={minutes}
              type="button"
              variant="outline"
              className="h-auto min-h-11 whitespace-normal"
              disabled={!allowed(minutes)}
              onClick={() => {
                add(minutes)
                closeOptions()
              }}
            >
              {describeReminder(minutes)}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            className="col-span-2 min-h-11"
            disabled={!isFutureReminder(start, 1, currentTime)}
            onClick={() => {
              setCustom(true)
              closeOptions()
            }}
          >
            Personalizar…
          </Button>
        </CollapsibleContent>
      </Collapsible>
      {custom && canAdd && (
        <div className="grid gap-3 rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Lembrete personalizado</span>
            <Button
              aria-label="Fechar lembrete personalizado"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setCustom(false)
                trigger.current?.focus()
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <fieldset className="grid min-w-0 grid-cols-3 gap-2">
            <legend className="mb-2 text-sm font-medium">
              Unidade de antecedência
            </legend>
            {units.map((option) => (
              <Button
                key={option.minutes}
                type="button"
                variant={unit === option.minutes ? 'secondary' : 'outline'}
                className="min-h-11 min-w-0 px-1"
                aria-pressed={unit === option.minutes}
                disabled={!isFutureReminder(start, option.minutes, currentTime)}
                onClick={() => setUnit(option.minutes)}
              >
                {option.label}
              </Button>
            ))}
          </fieldset>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input
              aria-label="Quantidade de antecedência"
              className="min-h-11"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={
                !/^\d+$/.test(amount) ||
                customOffset === 0 ||
                !allowed(customOffset)
              }
              onClick={() => {
                add(customOffset)
                trigger.current?.focus()
              }}
            >
              Adicionar
            </Button>
          </div>
        </div>
      )}
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {!start
          ? 'Escolha uma data e hora para adicionar lembretes.'
          : !isFutureReminder(start, 0, currentTime)
            ? 'O horário precisa estar no futuro para receber lembretes.'
            : value.length >= maxReminders
              ? 'Até cinco lembretes por item.'
              : 'Só é possível escolher horários de aviso que ainda não passaram.'}
      </p>
    </div>
  )
}
