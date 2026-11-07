import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext } from '@/features/auth/auth-context'
import type { AuthUser } from '@/features/auth/auth-api'
import { apiRequest } from '@/lib/http-client'
import { ThemeToggle } from '@/components/theme-toggle'
import { PalettePicker } from '@/components/palette-picker'
import { AccountPreferencesProvider } from './account-preferences'
import { ThemeProvider } from './theme-provider'
import { PaletteProvider } from './palette-provider'

jest.mock('@/lib/http-client', () => ({
  ...jest.requireActual('@/lib/http-client'),
  apiRequest: jest.fn(),
}))
const request = jest.mocked(apiRequest)
const a: AuthUser = {
  id: 'alpha',
  email: 'alpha@example.test',
  name: 'Alpha',
  preferences: { theme: 'dark', palette: 'green' },
}
const b: AuthUser = {
  id: 'bravo',
  email: 'bravo@example.test',
  name: 'Bravo',
  preferences: { theme: 'light', palette: 'blue' },
}
function Appearance({ user }: { user: AuthUser | null }) {
  return (
    <AuthContext.Provider
      value={{
        user,
        checking: false,
        expired: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
      }}
    >
      <AccountPreferencesProvider>
        <ThemeProvider>
          <PaletteProvider>
            <ThemeToggle />
            <PalettePicker />
          </PaletteProvider>
        </ThemeProvider>
      </AccountPreferencesProvider>
    </AuthContext.Provider>
  )
}
beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  request.mockReset().mockResolvedValue({})
})
it('restores each account appearance and clears it on logout without inheriting guest storage', async () => {
  localStorage.setItem('theme', 'dark')
  localStorage.setItem('colabora-palette', 'red')
  const { rerender } = render(<Appearance user={a} />)
  expect(document.documentElement).toHaveClass('dark')
  expect(document.documentElement).toHaveAttribute('data-palette', 'green')
  rerender(<Appearance user={b} />)
  expect(document.documentElement).toHaveClass('light')
  expect(document.documentElement).toHaveAttribute('data-palette', 'blue')
  rerender(<Appearance user={null} />)
  expect(document.documentElement).toHaveClass('light')
  expect(document.documentElement).toHaveAttribute('data-palette', 'purple')
  rerender(<Appearance user={a} />)
  expect(document.documentElement).toHaveClass('dark')
  expect(document.documentElement).toHaveAttribute('data-palette', 'green')
  expect(request).not.toHaveBeenCalled()
})
it('saves changes through the authenticated preferences endpoint', async () => {
  const user = userEvent.setup()
  render(<Appearance user={a} />)
  await user.click(
    await screen.findByRole('button', { name: 'Usar tema claro' }),
  )
  expect(request).toHaveBeenCalledWith('/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ theme: 'light' }),
  })
  await user.click(screen.getByRole('radio', { name: 'Vermelho' }))
  expect(request).toHaveBeenCalledWith('/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ palette: 'red' }),
  })
  expect(document.documentElement).toHaveAttribute('data-palette', 'red')
})
it('does not show an old account save failure after switching accounts', async () => {
  let rejectSave!: (error: Error) => void
  request.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectSave = reject
    }),
  )
  const { rerender } = render(<Appearance user={a} />)
  await userEvent.click(
    await screen.findByRole('button', { name: 'Usar tema claro' }),
  )
  rerender(<Appearance user={b} />)
  rejectSave(new Error('Falha'))
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  )
  expect(document.documentElement).toHaveClass('light')
  expect(document.documentElement).toHaveAttribute('data-palette', 'blue')
})

it('lets visitors toggle both ways and keeps their selection after a reload without calling the API', async () => {
  const user = userEvent.setup()
  const view = render(<Appearance user={null} />)
  await user.click(
    await screen.findByRole('button', { name: 'Usar tema escuro' }),
  )
  expect(document.documentElement).toHaveClass('dark')
  await user.click(screen.getByRole('button', { name: 'Usar tema claro' }))
  expect(document.documentElement).toHaveClass('light')
  await user.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
  await user.click(screen.getByRole('radio', { name: 'Vermelho' }))
  view.unmount()
  render(<Appearance user={null} />)
  expect(document.documentElement).toHaveClass('dark')
  expect(document.documentElement).toHaveAttribute('data-palette', 'red')
  expect(request).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps visitor appearance separate from a registered account', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<Appearance user={null} />)
  await user.click(
    await screen.findByRole('button', { name: 'Usar tema escuro' }),
  )
  await user.click(screen.getByRole('radio', { name: 'Vermelho' }))
  rerender(<Appearance user={b} />)
  expect(document.documentElement).toHaveClass('light')
  expect(document.documentElement).toHaveAttribute('data-palette', 'blue')
  rerender(<Appearance user={null} />)
  expect(document.documentElement).toHaveClass('dark')
  expect(document.documentElement).toHaveAttribute('data-palette', 'red')
  expect(request).not.toHaveBeenCalled()
})
