import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { useAuth } from '@/features/auth/auth-context'
import type { AccountPreferences } from '@/features/auth/auth-api'
import { apiRequest } from '@/lib/http-client'

const defaults: AccountPreferences = { theme: 'system', palette: 'purple' }
export const AccountPreferencesContext = createContext<{
  preferences: AccountPreferences
  setPreferences: (patch: Partial<AccountPreferences>) => void
  email: string | null
} | null>(null)

export function AccountPreferencesProvider({
  children,
}: {
  children: ReactNode
}) {
  const { user } = useAuth()
  const [local, setLocal] = useState<{
    id: string
    patch: Partial<AccountPreferences>
  } | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null,
  )
  useEffect(() => {
    setLocal(null)
    setError(null)
  }, [user?.id])
  const accountId = useRef(user?.id)
  accountId.current = user?.id
  const preferences = user
    ? {
        ...defaults,
        ...user.preferences,
        ...(local?.id === user.id ? local.patch : {}),
      }
    : defaults
  function setPreferences(patch: Partial<AccountPreferences>) {
    if (!user) return
    const id = user.id
    setLocal((current) => ({
      id,
      patch: { ...(current?.id === id ? current.patch : {}), ...patch },
    }))
    setError(null)
    apiRequest<AccountPreferences>('/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }).catch(() => {
      if (accountId.current === id)
        setError({
          id,
          message:
            'Não foi possível salvar a aparência na sua conta. Tente selecionar novamente.',
        })
    })
  }
  return (
    <AccountPreferencesContext.Provider
      value={{
        preferences,
        setPreferences,
        email: user?.email.trim().toLowerCase() ?? null,
      }}
    >
      {error && error.id === user?.id ? (
        <p
          role="alert"
          className="fixed top-0 inset-x-0 z-[100] bg-destructive p-3 text-sm text-white"
        >
          {error.message}
        </p>
      ) : null}
      {children}
    </AccountPreferencesContext.Provider>
  )
}

export function useAccountPreferences() {
  return useContext(AccountPreferencesContext)
}
