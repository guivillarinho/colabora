import { apiRequest } from '@/lib/http-client'
import { uploadAvatar } from './upload-avatar'

jest.mock('@/lib/http-client', () => ({
  apiRequest: jest.fn(),
}))

it('rejects a document before contacting the server', async () => {
  const file = new File(['notes'], 'notas.pdf', { type: 'application/pdf' })
  await expect(uploadAvatar(file, 'user')).rejects.toThrow(
    'Use uma imagem PNG, JPEG ou WebP.',
  )
  expect(apiRequest).not.toHaveBeenCalled()
})

it('rejects a photo larger than 10 MB before contacting the server', async () => {
  const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'foto.png', {
    type: 'image/png',
  })
  await expect(uploadAvatar(file, 'user')).rejects.toThrow(
    'A foto deve ter no máximo 10 MB.',
  )
  expect(apiRequest).not.toHaveBeenCalled()
})
