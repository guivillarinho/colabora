import { put } from '@vercel/blob/client'

import { clearHttpSession, acceptHttpSession } from '@/lib/http-client'

import { uploadAgendaFiles } from './upload-agenda-files'

jest.mock('@vercel/blob/client', () => ({
  put: jest.fn(),
}))

const uploadedUrl = '/uploads/agenda/11111111-1111-4111-8111-111111111111.pdf'
const cloudUploads = process.env.VITE_CLOUD_UPLOADS

function pdf(name = 'nota.pdf', bytes = 8) {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
}

function withSize(file: File, size: number) {
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function hang(signal?: AbortSignal | null) {
  return new Promise<Response>((_resolve, reject) => {
    const abort = () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

describe('uploadAgendaFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearHttpSession()
    delete process.env.VITE_CLOUD_UPLOADS
    globalThis.fetch = jest.fn()
  })

  afterEach(() => {
    jest.useRealTimers()
    if (cloudUploads === undefined) delete process.env.VITE_CLOUD_UPLOADS
    else process.env.VITE_CLOUD_UPLOADS = cloudUploads
  })

  it('rejects more than 10 files or 10 MB before any request', async () => {
    const tooMany = Array.from({ length: 11 }, (_, index) =>
      pdf(`arquivo-${index}.pdf`),
    )
    await expect(uploadAgendaFiles(tooMany, 'user')).rejects.toMatchObject({
      code: 'invalid',
      message: 'É possível enviar no máximo 10 arquivos por vez.',
    })
    await expect(
      uploadAgendaFiles([withSize(pdf(), 10 * 1024 * 1024 + 1)], 'user'),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'Cada arquivo deve ter no máximo 10 MB.',
    })
    await expect(
      uploadAgendaFiles([pdf('virus.exe')], 'user'),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'Tipo de arquivo não permitido.',
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('keeps only files that finished and clears a mid-batch failure', async () => {
    acceptHttpSession('csrf')
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(json([{ name: 'um.pdf', url: uploadedUrl }]))
      .mockResolvedValueOnce(json({ message: 'Falhou no meio.' }, 400))
    const progress: string[] = []
    await expect(
      uploadAgendaFiles([pdf('um.pdf'), pdf('dois.pdf')], 'user', {
        onProgress: (update) => {
          progress.push(`${update.index}/${update.total}`)
        },
      }),
    ).rejects.toMatchObject({
      code: 'failed',
      message: 'Falhou no meio. Os arquivos já concluídos foram mantidos.',
      completed: [{ name: 'um.pdf', url: uploadedUrl }],
    })
    expect(progress).toEqual(['1/2', '1/2', '2/2'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('cancels the current file and keeps the previous one', async () => {
    acceptHttpSession('csrf')
    const controller = new AbortController()
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(json([{ name: 'um.pdf', url: uploadedUrl }]))
    await expect(
      uploadAgendaFiles([pdf('um.pdf'), pdf('dois.pdf')], 'user', {
        signal: controller.signal,
        onProgress: (update) => {
          if (update.index === 2) controller.abort()
        },
      }),
    ).rejects.toMatchObject({
      code: 'cancelled',
      message: 'Envio cancelado. Os arquivos já concluídos foram mantidos.',
      completed: [{ name: 'um.pdf', url: uploadedUrl }],
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('aborts a hanging upload when the timeout elapses', async () => {
    jest.useFakeTimers()
    acceptHttpSession('csrf')
    let signal: AbortSignal | null | undefined
    jest.mocked(globalThis.fetch).mockImplementation((_url, init) => {
      signal = init?.signal
      return hang(signal)
    })
    const pending = uploadAgendaFiles([pdf()], 'user', { timeoutMs: 5_000 })
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'timeout',
      completed: [],
      message: 'O envio demorou demais e foi interrompido.',
    })
    await jest.advanceTimersByTimeAsync(5_000)
    await assertion
    expect(signal?.aborted).toBe(true)
  })

  it('aborts a hanging session check instead of leaving the upload pending', async () => {
    jest.useFakeTimers()
    let signal: AbortSignal | null | undefined
    jest.mocked(globalThis.fetch).mockImplementation((_url, init) => {
      signal = init?.signal
      return hang(signal)
    })
    const pending = uploadAgendaFiles([pdf()], 'user', { timeoutMs: 1_000 })
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await jest.advanceTimersByTimeAsync(1_000)
    await assertion
    expect(signal?.aborted).toBe(true)
  })

  it('returns a cloud reference only after the transfer succeeds', async () => {
    process.env.VITE_CLOUD_UPLOADS = 'true'
    acceptHttpSession('csrf')
    const order: string[] = []
    jest.mocked(globalThis.fetch).mockImplementation(async () => {
      order.push('token')
      return json({ clientToken: 'token' })
    })
    jest.mocked(put).mockImplementation(async () => {
      order.push('put')
      return {} as never
    })
    const uploaded = await uploadAgendaFiles([pdf('nota.pdf')], 'user-1')
    expect(order).toEqual(['token', 'put'])
    expect(uploaded).toEqual([
      {
        name: 'nota.pdf',
        url: expect.stringMatching(/^\/uploads\/agenda\/[0-9a-f-]+\.pdf$/),
      },
    ])
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^agenda\/user-1\/[0-9a-f-]+\.pdf$/),
      expect.any(File),
      expect.objectContaining({
        token: 'token',
        abortSignal: expect.any(AbortSignal),
      }),
    )
  })

  it('does not keep a cloud file when the transfer fails or is cancelled', async () => {
    process.env.VITE_CLOUD_UPLOADS = 'true'
    acceptHttpSession('csrf')
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValue(json({ clientToken: 'token' }))
    jest.mocked(put).mockRejectedValueOnce(new Error('falha de rede'))
    await expect(uploadAgendaFiles([pdf()], 'user-1')).rejects.toMatchObject({
      code: 'failed',
      completed: [],
      message: 'falha de rede',
    })

    const controller = new AbortController()
    const seen: Array<number | null> = []
    jest.mocked(put).mockImplementation((_pathname, _body, options) => {
      return new Promise((_resolve, reject) => {
        options.abortSignal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
        options.onUploadProgress?.({
          loaded: 4,
          total: 8,
          percentage: 44.6,
        })
      })
    })
    await expect(
      uploadAgendaFiles([pdf()], 'user-1', {
        signal: controller.signal,
        onProgress: (update) => {
          seen.push(update.percentage)
          if (update.percentage === 45) controller.abort()
        },
      }),
    ).rejects.toMatchObject({ code: 'cancelled', completed: [] })
    expect(seen).toContain(45)
  })
})
