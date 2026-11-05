import { CalendarDays, House, Timer, UserRound } from 'lucide-react'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'

export type AppSection = 'hoje' | 'timer' | 'agenda' | 'perfil' | 'chat'

export type NavItem = {
  id: AppSection
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { id: 'hoje', label: 'Hoje', icon: House },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'timer', label: 'Timer', icon: Timer },
  { id: 'perfil', label: 'Perfil', icon: UserRound },
]

type NavigationContextValue = {
  section: AppSection
  goTo: (section: AppSection) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

type NavigationProviderProps = {
  children: ReactNode
  initialSection?: AppSection
}

export function NavigationProvider({
  children,
  initialSection,
}: NavigationProviderProps) {
  const [section, setSection] = useState<AppSection>(
    () =>
      initialSection ??
      (window.location.pathname === '/chat' ? 'chat' : undefined) ??
      navItems.find((item) => `/${item.id}` === window.location.pathname)?.id ??
      'hoje',
  )
  const value = useMemo(
    () => ({
      section,
      goTo: (next: AppSection) => {
        setSection(next)
        window.history.replaceState(null, '', `/${next}`)
      },
    }),
    [section],
  )

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)

  if (!context) {
    throw new Error('useNavigation precisa estar dentro de NavigationProvider.')
  }

  return context
}
