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

type PaletteContextValue = {
  palette: AppPalette
  setPalette: (palette: AppPalette) => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState(readStoredPalette)

  useLayoutEffect(() => {
    applyPalette(palette)
  }, [palette])

  const value = useMemo<PaletteContextValue>(
    () => ({
      palette,
      setPalette(next) {
        setPaletteState(next)
        storePalette(next)
      },
    }),
    [palette],
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
