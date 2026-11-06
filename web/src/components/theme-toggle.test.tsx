import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PaletteProvider } from '@/app/palette-provider'
import { PALETTE_STORAGE_KEY } from '@/app/palette'
import { ThemeProvider } from '@/app/theme-provider'
import { PalettePicker } from '@/components/palette-picker'

import { ThemeModePicker, ThemeToggle } from './theme-toggle'

function renderAppearance() {
  return render(
    <ThemeProvider>
      <PaletteProvider>
        <ThemeToggle />
        <ThemeModePicker />
        <PalettePicker />
      </PaletteProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.palette
  document.documentElement.className = ''
})

it('alternates only between light and dark from the quick control', async () => {
  const user = userEvent.setup()
  localStorage.setItem('theme', 'light')
  renderAppearance()

  await user.click(
    await screen.findByRole('button', { name: 'Usar tema escuro' }),
  )
  expect(localStorage.getItem('theme')).toBe('dark')
  expect(document.documentElement).toHaveClass('dark')
  expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked()

  await user.click(screen.getByRole('button', { name: 'Usar tema claro' }))
  expect(localStorage.getItem('theme')).toBe('light')
  expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
  expect(document.documentElement).not.toHaveClass('dark')

  await user.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
  expect(localStorage.getItem('theme')).toBe('dark')
  expect(
    screen.queryByRole('button', { name: 'Usar tema do sistema' }),
  ).not.toBeInTheDocument()
})

it('selects system again from the profile control', async () => {
  const user = userEvent.setup()
  renderAppearance()
  await user.click(await screen.findByRole('radio', { name: 'Escuro' }))
  await user.click(screen.getByRole('radio', { name: 'Sistema' }))
  expect(localStorage.getItem('theme')).toBe('system')
  expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
  expect(localStorage.getItem('theme')).toBe('dark')
  expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked()
})

it('switches from a dark system theme directly to light', async () => {
  const matchMedia = window.matchMedia
  const media = jest
    .spyOn(window, 'matchMedia')
    .mockImplementation((query) => ({
      ...matchMedia(query),
      matches: query === '(prefers-color-scheme: dark)',
    }))
  try {
    const user = userEvent.setup()
    localStorage.setItem('theme', 'system')
    renderAppearance()
    expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
    await user.click(
      await screen.findByRole('button', { name: 'Usar tema claro' }),
    )
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
  } finally {
    media.mockRestore()
  }
})

it('persists each palette across a new render', async () => {
  const user = userEvent.setup()
  const view = renderAppearance()

  for (const label of ['Verde', 'Azul', 'Amarelo', 'Vermelho', 'Roxo']) {
    await user.click(screen.getByRole('radio', { name: label }))
    expect(screen.getByRole('radio', { name: label })).toBeChecked()
  }

  expect(document.documentElement).toHaveAttribute('data-palette', 'purple')
  expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('purple')
  view.unmount()

  localStorage.setItem(PALETTE_STORAGE_KEY, 'blue')
  renderAppearance()
  expect(document.documentElement).toHaveAttribute('data-palette', 'blue')
  expect(screen.getByRole('radio', { name: 'Azul' })).toBeChecked()
})
