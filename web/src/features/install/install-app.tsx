import { Download } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type InstallPrompt = Event & {
  prompt: () => Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const InstallContext = createContext<{
  installed: boolean
  prompt: InstallPrompt | null
  clearPrompt: () => void
}>({ installed: false, prompt: null, clearPrompt: () => undefined })

export function InstallAppProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)')
    const ios = navigator as Navigator & { standalone?: boolean }
    const updateMode = () =>
      setInstalled(standalone.matches || ios.standalone === true)
    const capturePrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    const markInstalled = () => {
      setPrompt(null)
      setInstalled(true)
    }

    updateMode()
    standalone.addEventListener('change', updateMode)
    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      standalone.removeEventListener('change', updateMode)
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  return (
    <InstallContext.Provider
      value={{ installed, prompt, clearPrompt: () => setPrompt(null) }}
    >
      {children}
    </InstallContext.Provider>
  )
}

export function InstallApp() {
  const { installed, prompt, clearPrompt } = useContext(InstallContext)
  const button = useRef<HTMLButtonElement>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [prompting, setPrompting] = useState(false)

  async function install() {
    if (!prompt) {
      setShowHelp(true)
      return
    }

    setPrompting(true)
    try {
      await prompt.prompt()
      await prompt.userChoice
    } catch {
      setShowHelp(true)
    } finally {
      clearPrompt()
      setPrompting(false)
    }
  }

  if (installed) return null

  return (
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <Button
        ref={button}
        className="mt-2 w-fit"
        disabled={prompting}
        onClick={install}
        type="button"
        variant="outline"
      >
        <Download aria-hidden="true" />
        Instalar Colabora
      </Button>
      <DialogContent
        className="max-h-[85svh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          button.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Instalar Colabora</DialogTitle>
          <DialogDescription>
            Use o menu do navegador para adicionar o Colabora ao dispositivo.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Android</strong> — Abra o menu
            do navegador e toque em <strong>Instalar app</strong> ou{' '}
            <strong>Adicionar à tela inicial</strong>.
          </li>
          <li>
            <strong className="text-foreground">iPhone e iPad</strong> — No
            Safari, toque em <strong>Compartilhar</strong> →{' '}
            <strong>Adicionar à Tela de Início</strong>. Se aparecer, ative{' '}
            <strong>Abrir como App da Web</strong>.
          </li>
          <li>
            <strong className="text-foreground">Computador</strong> — No Chrome
            ou Edge, use o ícone de instalação na barra de endereço ou procure{' '}
            <strong>Instalar</strong> no menu do navegador.
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  )
}
