import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

const themeModes = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
  { id: 'system', label: 'Sistema' },
] as const

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const dark = ready && resolvedTheme === 'dark'
  const upcoming = dark ? 'light' : 'dark'
  const CurrentIcon = dark ? Moon : Sun
  const label = dark ? 'Usar tema claro' : 'Usar tema escuro'

  return (
    <Button
      aria-label={label}
      size="icon"
      type="button"
      variant="outline"
      onClick={() => setTheme(upcoming)}
    >
      <CurrentIcon />
    </Button>
  )
}

export function ThemeModePicker() {
  const { theme, setTheme } = useTheme()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const current = ready ? (theme ?? 'system') : undefined

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Modo</legend>
      <div className="flex flex-wrap gap-2">
        {themeModes.map((mode) => (
          <label
            key={mode.id}
            className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm has-[:checked]:border-transparent has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            <input
              checked={current === mode.id}
              className="sr-only"
              name="theme-mode"
              type="radio"
              value={mode.id}
              onChange={() => setTheme(mode.id)}
            />
            {mode.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
