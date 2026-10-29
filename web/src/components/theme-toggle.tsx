import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const isDark = ready && resolvedTheme === 'dark'
  const label = isDark ? 'Usar tema claro' : 'Usar tema escuro'

  return (
    <Button
      aria-label={label}
      size="icon"
      type="button"
      variant="outline"
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark')
      }}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  )
}
