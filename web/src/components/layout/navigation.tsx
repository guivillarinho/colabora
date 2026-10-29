import { CalendarDays, House, ListTodo, UserRound } from 'lucide-react'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'

export type AppSection = 'hoje' | 'tarefas' | 'agenda' | 'perfil'

export type NavItem = {
  id: AppSection
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { id: 'hoje', label: 'Hoje', icon: House },
  { id: 'tarefas', label: 'Tarefas', icon: ListTodo },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
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
  initialSection = 'hoje',
}: NavigationProviderProps) {
  const [section, setSection] = useState<AppSection>(initialSection)
  const value = useMemo(
    () => ({
      section,
      goTo: setSection,
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
