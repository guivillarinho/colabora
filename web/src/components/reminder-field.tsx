import { Bell, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
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
const selectClass =
  'min-h-10 min-w-0 rounded-lg border bg-background px-3 text-sm disabled:opacity-60'

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
      <select
        id={id}
        className={selectClass}
        aria-describedby={`${id}-hint`}
        value={custom && canAdd ? 'custom' : ''}
        disabled={!canAdd}
        onChange={(event) => {
          const option = event.target.value
          if (option === 'custom') setCustom(true)
          else if (option) add(Number(option))
          else setCustom(false)
        }}
      >
        <option value="">Adicionar lembrete</option>
        {presets.map((minutes) => (
          <option key={minutes} value={minutes} disabled={!allowed(minutes)}>
            {describeReminder(minutes)}
          </option>
        ))}
        <option
          value="custom"
          disabled={!isFutureReminder(start, 1, currentTime)}
        >
          Personalizar…
        </option>
      </select>
      {custom && canAdd && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <Input
            aria-label="Quantidade de antecedência"
            className="min-h-10"
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <select
            aria-label="Unidade de antecedência"
            className={selectClass}
            value={unit}
            onChange={(event) => setUnit(Number(event.target.value))}
          >
            {units.map((option) => (
              <option
                key={option.minutes}
                value={option.minutes}
                disabled={!isFutureReminder(start, option.minutes, currentTime)}
              >
                {option.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={
              !/^\d+$/.test(amount) ||
              customOffset === 0 ||
              !allowed(customOffset)
            }
            onClick={() => add(customOffset)}
          >
            Adicionar
          </Button>
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
