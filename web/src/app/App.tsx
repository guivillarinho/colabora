import { AppShell } from '@/components/layout/app-shell'
import { NavigationProvider } from '@/components/layout/navigation'
import type { AppSection } from '@/components/layout/navigation'

type AppProps = {
  initialSection?: AppSection
}

export function App({ initialSection }: AppProps) {
  return (
    <NavigationProvider initialSection={initialSection}>
      <AppShell />
    </NavigationProvider>
  )
}
