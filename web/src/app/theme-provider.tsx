import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { useLayoutEffect, type ReactNode } from 'react'
import { useAccountPreferences } from './account-preferences'

type ThemeProviderProps = { children: ReactNode }
export function ThemeProvider({ children }: ThemeProviderProps) {
  const account = useAccountPreferences()
  return (
    <NextThemesProvider
      key={account?.email ?? 'guest'}
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={
        account ? `colabora-theme:${account.email ?? 'guest'}` : 'theme'
      }
    >
      <AccountThemeSync />
      {children}
    </NextThemesProvider>
  )
}
function AccountThemeSync() {
  const account = useAccountPreferences()
  const { setTheme } = useTheme()
  const theme = account?.preferences.theme
  useLayoutEffect(() => {
    if (theme) setTheme(theme)
  }, [theme, setTheme])
  return null
}
export function useAppTheme() {
  const theme = useTheme()
  const account = useAccountPreferences()
  return {
    ...theme,
    setTheme: (value: string) => {
      theme.setTheme(value)
      if (value === 'system' || value === 'light' || value === 'dark')
        account?.setPreferences({ theme: value })
    },
  }
}
