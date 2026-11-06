import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  applyPalette,
  readStoredPalette,
  storePalette,
  type AppPalette,
} from './palette'

import { useAccountPreferences } from './account-preferences'

type PaletteContextValue = {
  palette: AppPalette
  setPalette: (palette: AppPalette) => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

export function PaletteProvider({ children }: { children: ReactNode }) {
  const account = useAccountPreferences()
  const [guestPalette, setPaletteState] = useState(readStoredPalette)
  const palette = account?.preferences.palette ?? guestPalette

  useLayoutEffect(() => {
    applyPalette(palette)
  }, [palette])

  const value = useMemo<PaletteContextValue>(
    () => ({
      palette,
      setPalette(next) {
        if (account) {
          account.setPreferences({ palette: next })
          applyPalette(next)
        } else {
          setPaletteState(next)
          storePalette(next)
        }
      },
    }),
    [palette, account],
  )

  return (
    <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>
  )
}

export function usePalette() {
  const context = useContext(PaletteContext)
  if (!context) {
    throw new Error('usePalette deve ficar dentro de PaletteProvider')
  }
  return context
}
