import { AppShell } from '@/components/layout/app-shell'
import { HapticFeedback } from '@/components/haptic-feedback'
import { NavigationProvider } from '@/components/layout/navigation'
import type { AppSection } from '@/components/layout/navigation'

type AppProps = {
  initialSection?: AppSection
}

export function App({ initialSection }: AppProps) {
  return (
    <NavigationProvider initialSection={initialSection}>
      <HapticFeedback />
      <AppShell />
    </NavigationProvider>
  )
}
