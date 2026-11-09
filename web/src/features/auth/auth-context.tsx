import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  acceptHttpSession,
  clearHttpSession,
  HttpError,
  sessionExpiredEvent,
} from '@/lib/http-client'
import { authApi, type AuthUser, type SessionResponse } from './auth-api'

type AuthContextValue = {
  user: AuthUser | null
  checking: boolean
  expired: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: AuthUser) => void
  clearLocalSession?: () => void
}
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [expired, setExpired] = useState(false)
  const generation = useRef(0)
  const channel = useRef<BroadcastChannel | null>(null)

  const accept = useCallback((response: SessionResponse) => {
    generation.current += 1
    acceptHttpSession(response.csrfToken, response.user.id)
    setUser(response.user)
    setExpired(false)
    setChecking(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const current = generation.current
    authApi
      .me(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted && generation.current === current)
          accept(response)
      })
      .catch(() => {
        if (!controller.signal.aborted && generation.current === current) {
          clearHttpSession()
          setUser(null)
          setChecking(false)
        }
      })
    const expire = () => {
      generation.current += 1
      setUser(null)
      setExpired(true)
      setChecking(false)
    }
    window.addEventListener(sessionExpiredEvent, expire)
    return () => {
      controller.abort()
      window.removeEventListener(sessionExpiredEvent, expire)
    }
  }, [accept])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const broadcast = new BroadcastChannel('colabora-auth')
    channel.current = broadcast
    broadcast.onmessage = (event) => {
      if (event.data === 'avatar') {
        const current = generation.current
        authApi
          .me()
          .then((response) => {
            if (generation.current === current) setUser(response.user)
          })
          .catch(() => undefined)
        return
      }
      const current = ++generation.current
      clearHttpSession()
      setUser(null)
      setChecking(true)
      authApi
        .me()
        .then((response) => {
          if (generation.current === current) accept(response)
        })
        .catch(() => {
          if (generation.current === current) setChecking(false)
        })
    }
    return () => {
      broadcast.close()
      channel.current = null
    }
  }, [accept])

  async function login(email: string, password: string) {
    generation.current += 1
    const response = await authApi.login(email, password)
    window.history.replaceState(null, '', '/hoje')
    accept(response)
    channel.current?.postMessage('changed')
  }
  async function register(name: string, email: string, password: string) {
    generation.current += 1
    accept(await authApi.register(name, email, password))
    channel.current?.postMessage('changed')
  }
  async function logout() {
    try {
      await authApi.logout()
    } catch (cause) {
      if (!(cause instanceof HttpError && cause.status === 401)) throw cause
    }
    generation.current += 1
    clearHttpSession()
    setUser(null)
    setExpired(false)
    channel.current?.postMessage('changed')
  }

  const updateUser = useCallback((next: AuthUser) => {
    setUser((current) =>
      current && current.id === next.id
        ? {
            ...current,
            ...next,
            preferences: next.preferences ?? current.preferences,
          }
        : current,
    )
    channel.current?.postMessage('avatar')
  }, [])

  function clearLocalSession() {
    generation.current += 1
    clearHttpSession()
    setUser(null)
    setExpired(false)
    channel.current?.postMessage('changed')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        checking,
        expired,
        login,
        register,
        logout,
        updateUser,
        clearLocalSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth precisa estar dentro de AuthProvider.')
  return auth
}
