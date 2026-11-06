import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PaletteProvider } from '@/app/palette-provider'
import { ThemeProvider } from '@/app/theme-provider'
import { AccountPage } from './account-page'

const mockLogout = jest.fn()

jest.mock('@/features/google/google-settings', () => ({
  GoogleSettings: () => <p>Configurações do Google Agenda</p>,
}))
jest.mock('@/features/tasks/tasks-context', () => ({
  useTasks: () => ({
    tasks: [
      { status: 'pending' },
      { status: 'pending' },
      { status: 'in_progress' },
      { status: 'completed', category: 'Trabalho', actualTime: 25 },
    ],
  }),
}))
jest.mock('./auth-context', () => ({
  useAuth: () => ({
    user: { name: 'Ana', email: 'ana@example.test' },
    logout: mockLogout,
  }),
}))
jest.mock('@/lib/http-client', () => ({
  apiRequest: jest.fn().mockRejectedValue(new Error('offline')),
}))

function renderProfile() {
  return render(
    <ThemeProvider>
      <PaletteProvider>
        <AccountPage />
      </PaletteProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mockLogout.mockReset().mockResolvedValue(undefined)
})

it('shows the identity, real task totals and a compact list of options', () => {
  renderProfile()
  expect(screen.getByRole('heading', { name: 'Ana' })).toBeVisible()
  expect(screen.getByText('ana@example.test')).toBeVisible()
  expect(screen.getByRole('img', { name: 'Perfil de Ana' })).toBeVisible()
  const totals = screen.getByLabelText('Resumo das tarefas')
  expect(within(totals).getByText('Pendentes').parentElement).toHaveTextContent(
    '2',
  )
  expect(
    within(totals).getByText('Em andamento').parentElement,
  ).toHaveTextContent('1')
  expect(
    within(totals).getByText('Concluídas').parentElement,
  ).toHaveTextContent('1')
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryByText('Tempo por categoria')).not.toBeInTheDocument()
})

it('opens the existing appearance controls and restores focus to the option', async () => {
  const user = userEvent.setup()
  renderProfile()
  const appearance = screen.getByRole('button', { name: /Aparência/ })
  await user.click(appearance)
  expect(screen.getByRole('dialog', { name: 'Aparência' })).toBeVisible()
  expect(await screen.findByRole('radio', { name: 'Sistema' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Roxo' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Verde' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Azul' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Amarelo' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Vermelho' })).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: 'Escuro' }))
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(appearance).toHaveFocus()
  await user.click(appearance)
  expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked()
})

it('opens photo editing, notifications, calendar and task productivity from their options', async () => {
  const user = userEvent.setup()
  renderProfile()
  await user.click(
    screen.getByRole('button', { name: 'Editar foto de perfil' }),
  )
  expect(screen.getByRole('dialog', { name: 'Foto de perfil' })).toBeVisible()
  expect(
    screen.getAllByRole('heading', { name: 'Foto de perfil' }),
  ).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Enviar foto' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Concluir' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Notificações/ }))
  expect(screen.getByRole('dialog', { name: 'Notificações' })).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Notificações neste dispositivo' }),
  ).toBeVisible()
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: /Google Agenda/ }))
  expect(screen.getByRole('dialog', { name: 'Google Agenda' })).toBeVisible()
  expect(screen.getByText('Configurações do Google Agenda')).toBeVisible()
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: /Minha produtividade/ }))
  expect(
    screen.getByRole('dialog', { name: 'Minha produtividade' }),
  ).toBeVisible()
  expect(screen.getByText('Tempo por categoria')).toBeVisible()
  expect(screen.getAllByText('25 min')).toHaveLength(2)
})

it('lets the user retry when leaving the account fails', async () => {
  mockLogout.mockRejectedValueOnce(new Error('offline'))
  const user = userEvent.setup()
  renderProfile()
  await user.click(screen.getByRole('button', { name: 'Sair da conta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível encerrar a sessão.',
  )
  await user.click(screen.getByRole('button', { name: 'Sair da conta' }))
  expect(mockLogout).toHaveBeenCalledTimes(2)
})
