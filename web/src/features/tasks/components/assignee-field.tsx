import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/http-client'
import { useAuth } from '@/features/auth/auth-context'
import { PersonAvatar } from './person-avatar'
import type { Person } from '../types/task'

type AssigneeFieldProps = {
  value: Person | null
  onChange: (value: Person | null) => void
}
export function AssigneeField({ value, onChange }: AssigneeFieldProps) {
  const { user } = useAuth()
  const selectedPerson =
    value && value.id === user?.id ? { ...value, avatar: user.avatar } : value
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }
    setResults([])
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      setLoading(true)
      setError(null)
      apiRequest<Person[]>(`/users?query=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((users) => {
          if (!controller.signal.aborted) {
            setResults(users)
            if (!users.length) setError('Nenhum usuário encontrado.')
          }
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
    <section
      className="grid gap-4 rounded-xl border bg-muted/30 p-4"
      aria-label="Atribuição da tarefa"
    >
      <Label htmlFor="assignee-search">Responsável</Label>
      <div className="flex min-w-0 items-center gap-3">
        {selectedPerson ? (
          <PersonAvatar
            key={`${selectedPerson.id}:${selectedPerson.avatar?.kind === 'image' ? selectedPerson.avatar.revision : ''}`}
            person={selectedPerson}
          />
        ) : null}
        <p className="min-w-0 text-sm wrap-break-word">
          {selectedPerson?.name ?? 'Sem responsável'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (user)
              onChange({ id: user.id, name: user.name, avatar: user.avatar })
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
        placeholder="Buscar por nome ou e-mail completo"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls="assignee-suggestions"
        aria-expanded={results.length > 0}
        type="search"
        maxLength={254}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }}
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">
        Digite pelo menos 3 caracteres do nome ou o e-mail completo. A pessoa
        poderá aceitar ou recusar a tarefa.
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
          id="assignee-suggestions"
          role="listbox"
          className="max-h-56 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md"
        >
          {results.map((person) => (
            <li key={person.id} role="presentation">
              <button
                role="option"
                aria-selected={value?.id === person.id}
                type="button"
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => {
                  onChange(person)
                  setQuery('')
                  setResults([])
                }}
              >
                <PersonAvatar
                  key={`${person.id}:${person.avatar?.kind === 'image' ? person.avatar.revision : ''}`}
                  person={person}
                />
                <span className="min-w-0 wrap-break-word">{person.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
