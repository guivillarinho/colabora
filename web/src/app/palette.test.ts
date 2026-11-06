import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  PALETTE_STORAGE_KEY,
  appPalettes,
  applyPalette,
  readStoredPalette,
  storePalette,
} from './palette'

const css = readFileSync(path.join(__dirname, '../index.css'), 'utf8')

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.palette
})

it('keeps five palettes and ignores unknown values', () => {
  expect(appPalettes.map((palette) => palette.id)).toEqual([
    'purple',
    'green',
    'blue',
    'yellow',
    'red',
  ])
  localStorage.setItem(PALETTE_STORAGE_KEY, 'orange')
  expect(readStoredPalette()).toBe('purple')
})

it('stores the palette and restores it on the document', () => {
  storePalette('green')
  expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('green')
  delete document.documentElement.dataset.palette
  applyPalette(readStoredPalette())
  expect(document.documentElement).toHaveAttribute('data-palette', 'green')
})

it('defines each palette for light and dark primary, accent, and ring tokens', () => {
  for (const palette of appPalettes) {
    expect(css).toContain(`html[data-palette='${palette.id}']`)
  }
  const light = css.slice(
    css.indexOf(':root {', css.indexOf('@theme')),
    css.indexOf('.dark {', css.indexOf('@theme')),
  )
  const dark = css.slice(css.indexOf('.dark {', css.indexOf('@theme')))
  for (const token of ['--primary:', '--accent:', '--ring:']) {
    expect(light).toContain(token)
    expect(light).toContain('var(--palette-hue)')
    expect(dark).toContain(token)
    expect(dark).toContain('var(--palette-hue)')
  }
  expect(css).not.toMatch(/bg-primary:\s*#/)
})
