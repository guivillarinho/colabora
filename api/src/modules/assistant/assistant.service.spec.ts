import { GoogleGenAI } from '@google/genai'
import { AssistantService } from './assistant.service'
import { NotFoundException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { ChatDto, ConfirmDto } from './assistant.dto'
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }))
const proposal = {
  reply: 'Revise a tarefa.',
  title: 'Reunião',
  description: '',
  dueDate: '2026-11-06T10:00:00-03:00',
  priority: 'medium',
  estimatedTime: 30,
}
function setup() {
  const tasks = {
    findOne: jest.fn().mockRejectedValue(new NotFoundException()),
    create: jest.fn().mockResolvedValue({ id: 'saved' }),
  }
  const source = { query: jest.fn().mockResolvedValue([]) }
  const service = new AssistantService(
    { get: () => undefined } as never,
    { consume: jest.fn() } as never,
    tasks as never,
    source as never,
  )
  return { service, tasks, source }
}
it('validates model output and incomplete proposals', async () => {
  const { service } = setup()
  expect((await service.parse(JSON.stringify(proposal))).ready).toBe(true)
  expect(
    (await service.parse(JSON.stringify({ ...proposal, dueDate: '' }))).ready,
  ).toBe(false)
  for (const value of [
    { ...proposal, dueDate: '2026-11-06' },
    { ...proposal, extra: 'injection' },
    { ...proposal, estimatedTime: -1 },
    { ...proposal, priority: 'urgent' },
  ])
    await expect(service.parse(JSON.stringify(value))).rejects.toThrow()
})
it('does not call the provider before configuration', async () => {
  await expect(
    setup().service.chat(
      { message: 'oi', timezone: 'UTC', consent: true },
      'actor',
    ),
  ).rejects.toThrow('configurado')
})
it('requires consent and explicit confirmation', async () => {
  expect(
    await validate(
      plainToInstance(ChatDto, {
        message: 'oi',
        timezone: 'UTC',
        consent: false,
      }),
    ),
  ).not.toHaveLength(0)
  expect(
    await validate(
      plainToInstance(ConfirmDto, {
        ...proposal,
        confirmed: true,
        requestId: 'bad',
        confirmed: false,
      }),
    ),
  ).not.toHaveLength(0)
})
it('reuses an existing task without creating a duplicate', async () => {
  const { service, tasks } = setup()
  tasks.findOne.mockResolvedValue({ id: 'saved' } as never)
  expect(
    await service.confirm(
      {
        ...proposal,
        confirmed: true,
        requestId: '11111111-1111-4111-8111-111111111111',
      } as never,
      'actor',
    ),
  ).toEqual({ id: 'saved' })
  expect(tasks.create).not.toHaveBeenCalled()
})
it('returns the task created by a concurrent confirmation', async () => {
  const { service, tasks, source } = setup()
  tasks.findOne
    .mockRejectedValueOnce(new NotFoundException())
    .mockResolvedValueOnce({ id: 'saved' })
  tasks.create.mockRejectedValueOnce(
    new QueryFailedError('insert', [], { code: '23505' }),
  )
  expect(
    await service.confirm(
      {
        ...proposal,
        confirmed: true,
        requestId: '11111111-1111-4111-8111-111111111111',
      } as never,
      'actor',
    ),
  ).toEqual({ id: 'saved' })
  expect(source.query).toHaveBeenCalledWith(
    'UPDATE assistant_receipts SET completed=true WHERE id=$1',
    [expect.any(String)],
  )
})

it('does not treat an ordinary failure as a duplicate task', async () => {
  const { service, tasks } = setup()
  tasks.create.mockRejectedValueOnce(
    Object.assign(new Error('db'), { code: '23505' }),
  )
  await expect(
    service.confirm(
      {
        ...proposal,
        confirmed: true,
        requestId: '11111111-1111-4111-8111-111111111111',
      } as never,
      'actor',
    ),
  ).rejects.toThrow('db')
  expect(tasks.findOne).toHaveBeenCalledTimes(1)
})

it('does not recreate deleted tasks with completed receipts', async () => {
  const { service, source, tasks } = setup()
  source.query.mockResolvedValue([{ completed: true }] as never)
  await expect(
    service.confirm(
      {
        ...proposal,
        confirmed: true,
        requestId: '11111111-1111-4111-8111-111111111111',
      } as never,
      'actor',
    ),
  ).rejects.toThrow('removida')
  expect(tasks.create).not.toHaveBeenCalled()
})

it('calls the SDK with structured output and rejects provider failures safely', async () => {
  const generateContent = jest
    .fn()
    .mockResolvedValue({ text: JSON.stringify(proposal) })
  jest
    .mocked(GoogleGenAI)
    .mockImplementation(() => ({ models: { generateContent } }) as never)
  const service = new AssistantService(
    {
      get: (key: string) => (key === 'GEMINI_ENABLED' ? 'true' : 'test-key'),
      getOrThrow: () => 'test-key',
    } as never,
    { consume: jest.fn() } as never,
    {} as never,
    {} as never,
  )
  expect(
    (
      await service.chat(
        {
          message: 'Reunião amanhã às 10',
          timezone: 'America/Sao_Paulo',
          consent: true,
        },
        'actor',
      )
    ).ready,
  ).toBe(true)
  expect(generateContent).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gemini-2.5-flash-lite',
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        maxOutputTokens: 1000,
      }),
    }),
  )
  generateContent.mockRejectedValue(new Error('private provider error'))
  await expect(
    service.chat({ message: 'Oi', timezone: 'UTC', consent: true }, 'actor'),
  ).rejects.toThrow('Não foi possível consultar')
})
