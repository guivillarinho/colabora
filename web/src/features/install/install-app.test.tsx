import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallApp, InstallAppProvider } from './install-app'

it('opens browser instructions and restores focus when the dialog closes', async () => {
  const user = userEvent.setup()
  render(<InstallApp />)
  const button = screen.getByRole('button', { name: 'Instalar Colabora' })
  await user.click(button)
  expect(
    screen.getByRole('dialog', { name: 'Instalar Colabora' }),
  ).toBeVisible()
  expect(
    screen.getByText('Adicionar à Tela de Início', { exact: true }),
  ).toBeVisible()
  await user.keyboard('{Escape}')
  expect(button).toHaveFocus()
})

it('retains the native install prompt before the button mounts', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<InstallAppProvider>{null}</InstallAppProvider>)
  const prompt = jest.fn().mockResolvedValue(undefined)
  const event = Object.assign(
    new Event('beforeinstallprompt', { cancelable: true }),
    {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    },
  )
  act(() => {
    window.dispatchEvent(event)
  })
  expect(event.defaultPrevented).toBe(true)
  rerender(
    <InstallAppProvider>
      <InstallApp />
    </InstallAppProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Instalar Colabora' }))
  expect(prompt).toHaveBeenCalledTimes(1)
  act(() => {
    window.dispatchEvent(new Event('appinstalled'))
  })
  expect(
    screen.queryByRole('button', { name: 'Instalar Colabora' }),
  ).not.toBeInTheDocument()
})

it('hides installation in an installed app window', () => {
  const media = jest.spyOn(window, 'matchMedia')
  const original = media.getMockImplementation() ?? window.matchMedia
  // The JSDOM setup supplies a default media query result.
  const defaultQuery = original('(display-mode: standalone)')
  media.mockReturnValueOnce({ ...defaultQuery, matches: true })
  try {
    render(
      <InstallAppProvider>
        <InstallApp />
      </InstallAppProvider>,
    )
    expect(
      screen.queryByRole('button', { name: 'Instalar Colabora' }),
    ).not.toBeInTheDocument()
  } finally {
    media.mockRestore()
  }
})
