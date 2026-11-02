import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'

export function AuthPage() {
  const { login, register, expired } = useAuth()
  const [signUp, setSignUp] = useState(window.location.pathname === '/cadastro')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '')
      .trim()
      .toLowerCase()
    const password = String(data.get('password') ?? '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      setError('Informe um e-mail válido.')
      return
    }
    if (signUp && (name.length < 2 || name.length > 80)) {
      setError('Informe seu nome, com 2 a 80 caracteres.')
      return
    }
    if (password.length < (signUp ? 12 : 1) || password.length > 128) {
      setError(
        signUp ? 'Use uma senha de 12 a 128 caracteres.' : 'Informe sua senha.',
      )
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      if (signUp) await register(name, email, password)
      else await login(email, password)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível entrar. Tente novamente.',
      )
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <section className="grid w-full max-w-sm gap-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Colabora</p>
          <h1 className="text-2xl font-semibold">
            {signUp ? 'Criar sua conta' : 'Entre no seu ritmo'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Suas tarefas, com você em todos os dispositivos.
          </p>
        </div>
        {expired ? (
          <p role="status" className="text-sm text-muted-foreground">
            Sua sessão expirou. Entre novamente para continuar.
          </p>
        ) : null}
        <form
          noValidate
          className="grid gap-4"
          onSubmit={submit}
          aria-busy={pending}
        >
          {signUp ? (
            <div className="grid gap-2">
              <Label htmlFor="auth-name">Nome</Label>
              <Input
                id="auth-name"
                name="name"
                autoComplete="name"
                maxLength={80}
                required
                disabled={pending}
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="auth-email">E-mail</Label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="auth-password">Senha</Label>
            <Input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={signUp ? 'new-password' : 'current-password'}
              minLength={signUp ? 12 : 1}
              maxLength={128}
              required
              disabled={pending}
            />
            {signUp ? (
              <p className="text-xs text-muted-foreground">
                Use pelo menos 12 caracteres.
              </p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="w-full" type="submit" disabled={pending}>
            {pending ? 'Aguarde...' : signUp ? 'Criar conta' : 'Entrar'}
          </Button>
        </form>
        <Button
          variant="ghost"
          type="button"
          disabled={pending}
          onClick={() => {
            setSignUp(!signUp)
            setError(null)
          }}
        >
          {signUp ? 'Já tenho conta' : 'Quero criar uma conta'}
        </Button>
      </section>
    </main>
  )
}
