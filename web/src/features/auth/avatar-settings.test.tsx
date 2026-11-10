import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { AuthContext } from './auth-context'
import type { AuthUser } from './auth-api'
import { AvatarSettings } from './avatar-settings'
import { UserAvatar } from './user-avatar'
import { removeAvatar, selectAvatarPreset, uploadAvatar } from './upload-avatar'
import { testUser } from '@/test/auth-fixture'

jest.mock('./upload-avatar', () => ({
  uploadAvatar: jest.fn(),
  selectAvatarPreset: jest.fn(),
  removeAvatar: jest.fn(),
}))

const onDone = jest.fn()

function Harness({ avatar = null }: { avatar?: AuthUser['avatar'] }) {
  const [user, setUser] = useState<AuthUser>({ ...testUser, avatar })
  return (
    <AuthContext.Provider
      value={{
        user,
        checking: false,
        expired: false,
        login: async () => undefined,
        register: async () => undefined,
        logout: async () => undefined,
        updateUser: setUser,
      }}
    >
      <UserAvatar />
      <AvatarSettings onDone={onDone} />
    </AuthContext.Provider>
  )
}

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:photo')
  URL.revokeObjectURL = jest.fn()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['png'], { type: 'image/png' }),
  })
})

beforeEach(() => {
  jest.clearAllMocks()
})

it('shows a preset in the header as soon as the profile choice is saved', async () => {
  jest.mocked(selectAvatarPreset).mockResolvedValue({
    ...testUser,
    avatar: { kind: 'preset', id: 'leaf' },
  })
  render(<Harness />)
  expect(
    screen.getAllByRole('img', { name: 'Perfil de Guilherme' }),
  ).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: 'Folha' }))
  expect(
    await screen.findAllByRole('img', { name: 'Avatar Folha de Guilherme' }),
  ).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Folha' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

it('shows upload progress, keeps the current avatar until confirmation, and updates the header', async () => {
  let finish: (user: AuthUser) => void = () => undefined
  let report: ((percentage: number) => void) | undefined
  jest.mocked(uploadAvatar).mockImplementation(
    (_file, _userId, onProgress) =>
      new Promise((resolve) => {
        finish = resolve
        report = onProgress
      }),
  )
  render(<Harness avatar={{ kind: 'preset', id: 'leaf' }} />)
  const file = new File(['image'], 'foto.png', { type: 'image/png' })
  await userEvent.upload(screen.getByLabelText('Arquivo da foto'), file)
  const progress = screen.getByRole('progressbar', {
    name: 'Envio da foto de perfil',
  })
  expect(progress).not.toHaveAttribute('aria-valuenow')
  act(() => report?.(43))
  expect(progress).toHaveAttribute('aria-valuenow', '43')
  act(() => report?.(100))
  expect(screen.getByText('Finalizando a foto...')).toBeVisible()
  expect(
    screen.getAllByRole('img', { name: 'Avatar Folha de Guilherme' }),
  ).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Concluir' })).toBeDisabled()
  finish({
    ...testUser,
    avatar: { kind: 'image', revision: 'abc123abc123abcd' },
  })
  await waitFor(() =>
    expect(screen.getAllByAltText('Foto de Guilherme')).toHaveLength(2),
  )
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Concluir' })).toBeEnabled()
})

it('keeps the avatar on failure, shows the error, and allows retrying the same file', async () => {
  jest
    .mocked(uploadAvatar)
    .mockRejectedValueOnce(new Error('Não foi possível enviar a foto.'))
    .mockResolvedValueOnce({
      ...testUser,
      avatar: { kind: 'image', revision: 'nova' },
    })
  render(<Harness avatar={{ kind: 'preset', id: 'leaf' }} />)
  const input = screen.getByLabelText('Arquivo da foto')
  const file = new File(['image'], 'foto.png', { type: 'image/png' })
  await userEvent.upload(input, file)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível enviar a foto.',
  )
  expect(
    screen.getAllByRole('img', { name: 'Avatar Folha de Guilherme' }),
  ).toHaveLength(2)
  await userEvent.upload(input, file)
  expect(await screen.findAllByAltText('Foto de Guilherme')).toHaveLength(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('removes the personal avatar only after confirming, and allows canceling', async () => {
  jest.mocked(selectAvatarPreset).mockResolvedValue({
    ...testUser,
    avatar: { kind: 'preset', id: 'sun' },
  })
  jest.mocked(removeAvatar).mockResolvedValue({ ...testUser, avatar: null })
  render(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: 'Sol' }))
  await screen.findAllByRole('img', { name: 'Avatar Sol de Guilherme' })
  await userEvent.click(
    screen.getByRole('button', { name: 'Excluir foto de perfil' }),
  )
  expect(
    screen.getByRole('dialog', { name: 'Excluir foto de perfil?' }),
  ).toBeVisible()
  expect(
    screen.getByText(
      /Você poderá enviar outra foto ou escolher um avatar depois/,
    ),
  ).toBeVisible()
  expect(removeAvatar).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(removeAvatar).not.toHaveBeenCalled()
  expect(
    screen.getAllByRole('img', { name: 'Avatar Sol de Guilherme' }),
  ).toHaveLength(2)
  await userEvent.click(
    screen.getByRole('button', { name: 'Excluir foto de perfil' }),
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar exclusão' }),
  )
  expect(
    await screen.findAllByRole('img', { name: 'Perfil de Guilherme' }),
  ).toHaveLength(2)
  expect(removeAvatar).toHaveBeenCalledTimes(1)
})

it('keeps the confirmation open and the avatar intact when removal fails', async () => {
  jest.mocked(selectAvatarPreset).mockResolvedValue({
    ...testUser,
    avatar: { kind: 'preset', id: 'leaf' },
  })
  jest
    .mocked(removeAvatar)
    .mockRejectedValueOnce(new Error('Não foi possível excluir a foto.'))
  render(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: 'Folha' }))
  await screen.findAllByRole('img', { name: 'Avatar Folha de Guilherme' })
  await userEvent.click(
    screen.getByRole('button', { name: 'Excluir foto de perfil' }),
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar exclusão' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível excluir a foto.',
  )
  expect(
    screen.getByRole('dialog', { name: 'Excluir foto de perfil?' }),
  ).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(
    screen.getAllByRole('img', { name: 'Avatar Folha de Guilherme' }),
  ).toHaveLength(2)
})

it('offers the avatar alternatives and a finish action', async () => {
  render(<Harness />)
  expect(screen.getByText('ou escolha um avatar')).toBeVisible()
  expect(
    screen.getByRole('group', { name: 'Avatares predefinidos' }),
  ).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Concluir' }))
  expect(onDone).toHaveBeenCalledTimes(1)
})
