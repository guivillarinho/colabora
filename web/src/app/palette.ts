export const appPalettes = [
  { id: 'purple', label: 'Roxo' },
  { id: 'green', label: 'Verde' },
  { id: 'blue', label: 'Azul' },
  { id: 'yellow', label: 'Amarelo' },
  { id: 'red', label: 'Vermelho' },
] as const

export type AppPalette = (typeof appPalettes)[number]['id']

export const PALETTE_STORAGE_KEY = 'colabora-palette'

export function isAppPalette(value: string | null): value is AppPalette {
  return appPalettes.some((palette) => palette.id === value)
}

export function readStoredPalette(): AppPalette {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY)
    if (isAppPalette(stored)) return stored
  } catch {
    return 'purple'
  }
  return 'purple'
}

export function applyPalette(palette: AppPalette) {
  document.documentElement.dataset.palette = palette
}

export function storePalette(palette: AppPalette) {
  applyPalette(palette)
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette)
  } catch {
    /* The palette still applies for this visit when storage is blocked. */
  }
}
