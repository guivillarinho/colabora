import { NotFoundException, StreamableFile } from '@nestjs/common'
import { get } from '@vercel/blob'
import { AgendaFilesController } from './agenda-files.controller'

jest.mock('@vercel/blob', () => ({ get: jest.fn() }))

describe('AgendaFilesController', () => {
  const controller = new AgendaFilesController()
  const originalVercel = process.env.VERCEL

  beforeEach(() => {
    process.env.VERCEL = '1'
    jest.clearAllMocks()
  })

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
  })

  it('rejects paths outside the attachment namespace', async () => {
    await expect(controller.download('../private.pdf')).rejects.toBeInstanceOf(NotFoundException)
    expect(get).not.toHaveBeenCalled()
  })

  it('reports missing private files', async () => {
    jest.mocked(get).mockResolvedValue(null)
    await expect(controller.download('12345678-1234-1234-1234-123456789abc.pdf')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('streams a private attachment without exposing its storage token', async () => {
    jest.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close() } }),
      blob: { contentType: 'application/pdf' },
    } as NonNullable<Awaited<ReturnType<typeof get>>>)
    const response = await controller.download('12345678-1234-1234-1234-123456789abc.pdf')
    expect(response).toBeInstanceOf(StreamableFile)
    const chunks: Buffer[] = []
    for await (const chunk of response.getStream()) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]))
    expect(get).toHaveBeenCalledWith('agenda/12345678-1234-1234-1234-123456789abc.pdf', { access: 'private' })
  })
})
