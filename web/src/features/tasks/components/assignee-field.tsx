import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/http-client'
import { useAuth } from '@/features/auth/auth-context'
import type { Person } from '../types/task'

type AssigneeFieldProps = {
  value: Person | null
  onChange: (value: Person | null) => void
}
export function AssigneeField({ value, onChange }: AssigneeFieldProps) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      setLoading(true)
      setError(null)
      apiRequest<Person[]>(`/users?query=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((users) => {
          if (!controller.signal.aborted) setResults(users)
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError('Não foi possível buscar os usuários.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [query])
  return (
    <div className="grid gap-2">
      <Label htmlFor="assignee-search">Responsável</Label>
      <p className="text-sm">{value?.name ?? 'Sem responsável'}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (user) onChange({ id: user.id, name: user.name })
          }}
        >
          Para mim
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange(null)}
        >
          Sem responsável
        </Button>
      </div>
      <Input
        id="assignee-search"
        placeholder="Buscar por nome ou e-mail exato"
        maxLength={254}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">
        Digite pelo menos 3 caracteres. Só o nome dos resultados é exibido.
      </p>
      {loading ? (
        <p role="status" className="text-sm">
          Buscando usuários...
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {results.length ? (
        <ul
          aria-label="Usuários encontrados"
          className="grid gap-1 rounded-lg border p-2"
        >
          {results.map((person) => (
            <li key={person.id}>
              <Button
                variant="ghost"
                type="button"
                className="w-full justify-start"
                onClick={() => {
                  onChange(person)
                  setQuery('')
                  setResults([])
                }}
              >
                {person.name}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
