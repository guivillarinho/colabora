import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'

const maximumMinutes = 10080

export function parseMinutes(value: string, minimum: number): number | null {
  if (!/^\d+$/.test(value)) return null
  const minutes = Number(value)
  return Number.isSafeInteger(minutes) &&
    minutes >= minimum &&
    minutes <= maximumMinutes
    ? minutes
    : null
}

type MinutesInputProps = Omit<
  ComponentProps<typeof Input>,
  | 'type'
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'min'
  | 'max'
  | 'pattern'
  | 'inputMode'
> & { defaultValue?: number; minimum: number }

export function MinutesInput({
  defaultValue,
  minimum,
  ...props
}: MinutesInputProps) {
  const [value, setValue] = useState(String(defaultValue ?? ''))
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(event) => {
        const next = event.target.value
        if (!/^\d*$/.test(next)) return
        setValue(next)
        event.target.setCustomValidity(
          next !== '' && parseMinutes(next, minimum) === null
            ? `Informe um número inteiro entre ${minimum} e ${maximumMinutes} minutos.`
            : '',
        )
      }}
    />
  )
}
