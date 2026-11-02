import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'
import { authApi } from './auth-api'

type AuthPageMode = 'login' | 'register' | 'request-reset' | 'reset'

const passwordRules = [
  {
    label: 'Pelo menos 6 caracteres',
    matches: (value: string) => value.length >= 6,
  },
  {
    label: 'Uma letra maiúscula',
    matches: (value: string) => /\p{Lu}/u.test(value),
  },
  {
    label: 'Uma letra minúscula',
    matches: (value: string) => /\p{Ll}/u.test(value),
  },
  { label: 'Um número', matches: (value: string) => /\d/.test(value) },
  {
    label: 'Um caractere especial',
    matches: (value: string) => /[^\p{L}\p{N}\s]/u.test(value),
  },
]

function modeFromPath(): AuthPageMode {
  if (window.location.pathname === '/cadastro') return 'register'
  if (window.location.pathname === '/esqueci-senha') return 'request-reset'
  if (window.location.pathname === '/redefinir-senha') return 'reset'
  return 'login'
}

function pathForMode(mode: AuthPageMode) {
  return {
    login: '/entrar',
    register: '/cadastro',
    'request-reset': '/esqueci-senha',
    reset: '/redefinir-senha',
  }[mode]
}

function validPassword(value: string) {
  return (
    passwordRules.every((rule) => rule.matches(value)) && value.length <= 128
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  disabled: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={autoComplete === 'current-password' ? 1 : 6}
          maxLength={128}
          required
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </div>
  )
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul aria-label="Requisitos da senha" className="grid gap-1 text-xs">
      {passwordRules.map((rule) => {
        const valid = rule.matches(password)
        const Icon = valid ? Check : Circle
        return (
          <li
            key={rule.label}
            className={
              valid
                ? 'flex items-center gap-2 text-green-700 dark:text-green-400'
                : 'flex items-center gap-2 text-muted-foreground'
            }
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}

export function AuthPage() {
  const { login, register, expired, clearLocalSession } = useAuth()
  const [mode, setMode] = useState<AuthPageMode>(modeFromPath)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)

  useEffect(() => {
    const syncMode = () => {
      setMode(modeFromPath())
      setError(null)
      setNotice(null)
      setPassword('')
      setConfirmation('')
    }
    window.addEventListener('popstate', syncMode)
    return () => window.removeEventListener('popstate', syncMode)
  }, [])

  function navigate(next: AuthPageMode) {
    window.history.pushState(null, '', pathForMode(next))
    setMode(next)
    setError(null)
    setNotice(null)
    setPassword('')
    setConfirmation('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
      .trim()
      .toLowerCase()
    const name = String(data.get('name') ?? '').trim()

    if (
      mode !== 'reset' &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    ) {
      setError('Informe um e-mail válido.')
      return
    }
    if (mode === 'register' && (name.length < 2 || name.length > 80)) {
      setError('Informe seu nome, com 2 a 80 caracteres.')
      return
    }
    if (mode === 'request-reset') {
      submitting.current = true
      setPending(true)
      setError(null)
      setNotice(null)
      try {
        const response = await authApi.requestPasswordReset(email)
        setNotice(response.message)
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível enviar o e-mail agora. Tente novamente.',
        )
      } finally {
        submitting.current = false
        setPending(false)
      }
      return
    }

    if (mode === 'login' && (!password || password.length > 128)) {
      setError('Informe sua senha.')
      return
    }
    if ((mode === 'register' || mode === 'reset') && !validPassword(password)) {
      setError('A senha ainda não atende a todos os requisitos.')
      return
    }
    if (
      (mode === 'register' || mode === 'reset') &&
      password !== confirmation
    ) {
      setError('As senhas não conferem.')
      return
    }

    submitting.current = true
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'register') {
        await register(name, email, password)
      } else if (mode === 'login') {
        await login(email, password)
      } else {
        const token =
          new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
        if (!token)
          throw new Error('Link inválido. Solicite uma nova recuperação.')
        await authApi.resetPassword(token, password)
        clearLocalSession?.()
        window.history.pushState(null, '', pathForMode('login'))
        setMode('login')
        setPassword('')
        setConfirmation('')
        setNotice('Senha alterada. Entre com sua nova senha.')
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível continuar. Tente novamente.',
      )
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  const signUp = mode === 'register'
  const requestReset = mode === 'request-reset'
  const reset = mode === 'reset'
  const passwordLabel = reset ? 'Nova senha' : 'Senha'

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <section className="grid w-full max-w-sm gap-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Colabora</p>
          <h1 className="text-2xl font-semibold">
            {signUp
              ? 'Criar sua conta'
              : requestReset
                ? 'Esqueci minha senha'
                : reset
                  ? 'Criar nova senha'
                  : 'Entre no seu ritmo'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {requestReset
              ? 'Informe o e-mail da sua conta para receber um link de recuperação.'
              : reset
                ? 'Escolha uma senha nova para voltar à sua conta.'
                : 'Suas tarefas, com você em todos os dispositivos.'}
          </p>
        </div>
        {expired && mode === 'login' ? (
          <p role="status" className="text-sm text-muted-foreground">
            Sua sessão expirou. Entre novamente para continuar.
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="text-sm text-green-700 dark:text-green-400"
          >
            {notice}
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
          {!reset ? (
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
          ) : null}
          {!requestReset ? (
            <>
              <PasswordField
                id="auth-password"
                label={passwordLabel}
                value={password}
                onChange={setPassword}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                disabled={pending}
              />
              {signUp || reset ? (
                <PasswordChecklist password={password} />
              ) : null}
              {signUp || reset ? (
                <PasswordField
                  id="auth-password-confirmation"
                  label="Confirmar senha"
                  value={confirmation}
                  onChange={setConfirmation}
                  autoComplete="new-password"
                  disabled={pending}
                />
              ) : null}
            </>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="w-full" type="submit" disabled={pending}>
            {pending
              ? 'Aguarde...'
              : requestReset
                ? 'Enviar link de recuperação'
                : reset
                  ? 'Salvar nova senha'
                  : signUp
                    ? 'Criar conta'
                    : 'Entrar'}
          </Button>
        </form>
        <div className="grid gap-1">
          {mode === 'login' ? (
            <Button
              variant="ghost"
              type="button"
              disabled={pending}
              onClick={() => navigate('request-reset')}
            >
              Esqueci minha senha
            </Button>
          ) : null}
          <Button
            variant="ghost"
            type="button"
            disabled={pending}
            onClick={() => navigate(signUp ? 'login' : 'register')}
          >
            {signUp ? 'Já tenho conta' : 'Quero criar uma conta'}
          </Button>
          {mode !== 'login' && !signUp ? (
            <Button
              variant="ghost"
              type="button"
              disabled={pending}
              onClick={() => navigate('login')}
            >
              Voltar para entrar
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  )
}
