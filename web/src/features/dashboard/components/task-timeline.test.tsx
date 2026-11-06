import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAuthenticated as render, taskAccess } from '@/test/auth-fixture'
import type { Task } from '@/features/tasks/types/task'
import { hapticFeedback } from '@/lib/haptics'
import { TaskTimeline } from './task-timeline'

jest.mock('@/lib/haptics', () => ({ hapticFeedback: jest.fn() }))
jest.mock('@/features/tasks/tasks-context', () => ({
  useTasks: () => ({ createTask: jest.fn(), updateTask: jest.fn() }),
}))

const task: Task = {
  ...taskAccess,
  id: 'task-1',
  title: 'Revisar proposta',
  description: 'Consultar https://example.test antes da reunião.',
  category: 'Trabalho',
  priority: 'medium',
  color: 'red',
  dueDate: '2026-11-05T12:00:00.000Z',
  location: null,
  attachments: [],
  estimatedTime: 30,
  actualTime: null,
  status: 'pending',
  startedAt: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
}

function setup(value = task) {
  const onComplete = jest.fn().mockResolvedValue(undefined)
  const onDelete = jest.fn().mockResolvedValue(undefined)
  render(
    <TaskTimeline
      tasks={[value]}
      onComplete={onComplete}
      onDelete={onDelete}
    />,
  )
  const card = screen.getByRole('article')
  const row = card.closest('li')!
  return { card, row, onComplete, onDelete }
}

function pointer(target: Element, type: string, x: number, y = 0, id = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: 'mouse' },
  })
  fireEvent(target, event)
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.setItem('colabora:swipe-tutorial', 'seen')
})

it('opens the existing details on click and restores focus when closed', async () => {
  const user = userEvent.setup()
  const { onComplete, onDelete } = setup()
  await user.click(screen.getByRole('article'))
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Descrição' })).toHaveTextContent(
    'Consultar https://example.test',
  )
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('article')).toHaveFocus()
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it.each(['Enter', ' '])(
  'opens details with the %s key for a participant without edit permission',
  async (key) => {
    const user = userEvent.setup()
    setup({
      ...task,
      permissions: {
        edit: false,
        assign: false,
        delete: false,
        changeStatus: true,
      },
    })
    const button = screen.getByRole('article')
    button.focus()
    await user.keyboard(key === 'Enter' ? '{Enter}' : ' ')
    expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Editar tarefa' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Criada por Guilherme/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Excluir tarefa' }),
    ).not.toBeInTheDocument()
  },
)

it('accepts a tap with small movement without executing an action', () => {
  const { card, onComplete } = setup()
  pointer(card, 'pointerdown', 100, 100)
  pointer(card, 'pointermove', 104, 103)
  pointer(card, 'pointerup', 104, 103)
  fireEvent.click(card, { detail: 1 })
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
  expect(onComplete).not.toHaveBeenCalled()
  expect(hapticFeedback).not.toHaveBeenCalled()
})

it('pulses once per threshold entry, including reentry and switching direction before release', () => {
  const { card, onComplete, onDelete } = setup()
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointermove', 147)
  expect(hapticFeedback).not.toHaveBeenCalled()
  pointer(card, 'pointermove', 148)
  pointer(card, 'pointermove', 160)
  expect(hapticFeedback).toHaveBeenCalledTimes(1)
  expect(onComplete).not.toHaveBeenCalled()
  pointer(card, 'pointermove', 140)
  pointer(card, 'pointermove', 150)
  expect(hapticFeedback).toHaveBeenCalledTimes(2)
  pointer(card, 'pointermove', 50)
  expect(hapticFeedback).toHaveBeenCalledTimes(3)
  expect(hapticFeedback).toHaveBeenLastCalledWith('threshold')
  expect(onDelete).not.toHaveBeenCalled()
  pointer(card, 'pointerup', 50)
  fireEvent.click(card, { detail: 1 })
  expect(screen.getByText(/Tem certeza de que deseja excluir/)).toBeVisible()
  expect(
    screen.queryByRole('dialog', { name: task.title }),
  ).not.toBeInTheDocument()
  expect(hapticFeedback).toHaveBeenCalledTimes(3)
})

it('does not open details after a short drag that never reaches the action threshold', () => {
  const { card, onComplete, onDelete } = setup()
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointermove', 125)
  pointer(card, 'pointerup', 125)
  fireEvent.click(card, { detail: 1 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
  // A subsequent intentional tap remains usable.
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointerup', 100)
  fireEvent.click(screen.getByRole('article'))
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
})

it.each(['pointerup', 'pointercancel'])(
  'preserves vertical scrolling and ignores a trailing click after %s',
  (end) => {
    const { card, onComplete, onDelete } = setup()
    pointer(card, 'pointerdown', 100, 100)
    pointer(card, 'pointermove', 110, 150)
    pointer(card, 'pointermove', 180, 180)
    pointer(card, end, 180, 180)
    fireEvent.click(card, { detail: 1 })
    expect(card).toHaveStyle({ transform: 'translateX(0px)' })
    expect(onComplete).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(hapticFeedback).not.toHaveBeenCalled()
  },
)

it('cancels a horizontal gesture without executing it or opening details', () => {
  const { card, onComplete, onDelete } = setup()
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointermove', 160)
  pointer(card, 'pointercancel', 160)
  fireEvent.click(card, { detail: 1 })
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('ignores extra pointers and does not reveal actions without permission', () => {
  const { card, onComplete, onDelete } = setup({
    ...task,
    permissions: {
      edit: false,
      assign: false,
      delete: false,
      changeStatus: false,
    },
  })
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointermove', 180, 0, 2)
  pointer(card, 'pointerup', 180, 0, 2)
  pointer(card, 'pointermove', 30)
  pointer(card, 'pointerup', 30)
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
  expect(hapticFeedback).not.toHaveBeenCalled()
})

it('keeps editing on the details pencil and off the card', async () => {
  const user = userEvent.setup()
  setup()
  expect(
    screen.queryByRole('button', { name: 'Editar' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('img', { name: 'Responsável: Guilherme' }),
  ).toBeVisible()
  expect(screen.queryByText(/Criada por/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Responsável/)).not.toBeInTheDocument()
  expect(screen.getByRole('article')).toHaveClass('h-52')
  await user.click(screen.getByRole('article'))
  expect(screen.getByText('tarefa agendada')).toBeVisible()
  expect(screen.getByText(/Criada por Guilherme/)).toBeVisible()
  expect(screen.getByText(/Responsável: Guilherme/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Editar tarefa' }))
  expect(screen.getByRole('dialog', { name: 'Editar tarefa' })).toBeVisible()
})

it('shows a timed task with its start and an open finish', async () => {
  const user = userEvent.setup()
  setup({
    ...task,
    dueDate: null,
    startedAt: '2026-11-06T20:00:00.000Z',
    completedAt: null,
    timed: true,
    status: 'in_progress',
  })
  expect(screen.queryByText('Sem horário')).not.toBeInTheDocument()
  await user.click(screen.getByRole('article'))
  expect(screen.getByText('tarefa cronometrada')).toBeVisible()
  expect(screen.getAllByText('Em andamento').length).toBeGreaterThan(0)
  expect(screen.queryByText('tarefa agendada')).not.toBeInTheDocument()
})

it('recovers from unexpected pointer capture loss without executing the action', () => {
  const { card, row, onComplete } = setup()
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointermove', 160)
  pointer(row, 'lostpointercapture', 160)
  pointer(card, 'pointerup', 160)
  fireEvent.click(card, { detail: 1 })
  expect(onComplete).not.toHaveBeenCalled()
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointerup', 100)
  fireEvent.click(screen.getByRole('article'))
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
})

it('disables completion while saving, shows its error and allows a retry from details', async () => {
  const user = userEvent.setup()
  const { onComplete } = setup()
  let fail!: (reason: Error) => void
  onComplete.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject
    }),
  )
  await user.click(screen.getByRole('article'))
  await user.click(screen.getByRole('button', { name: 'Concluir tarefa' }))
  const saving = screen.getByRole('button', { name: 'Concluindo...' })
  expect(saving).toBeDisabled()
  expect(saving).toHaveAttribute('aria-busy', 'true')
  await user.click(saving)
  expect(onComplete).toHaveBeenCalledTimes(1)
  await act(async () => {
    fail(new Error('Falha de rede. Tente novamente.'))
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Falha de rede. Tente novamente.',
  )
  await user.click(screen.getByRole('button', { name: 'Concluir tarefa' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(onComplete).toHaveBeenCalledTimes(2)
})

function touch(target: Element, type: string, x: number, y = 100) {
  const point = { identifier: 1, clientX: x, clientY: y }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    touches: {
      value: type === 'touchend' || type === 'touchcancel' ? [] : [point],
    },
    changedTouches: { value: [point] },
  })
  fireEvent(target, event)
  return event
}

it('completes a native touch swipe and prevents horizontal browser scrolling', async () => {
  const { card, onComplete } = setup()
  touch(card, 'touchstart', 100)
  const event = touch(card, 'touchmove', 165, 105)
  expect(event.defaultPrevented).toBe(true)
  expect(card).toHaveStyle({ transform: 'translateX(65px)' })
  touch(card, 'touchend', 165, 105)
  fireEvent.click(card, { detail: 1 })
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(task.id))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('requires confirmation for native touch deletion and can cancel it', () => {
  const { card, onDelete } = setup()
  touch(card, 'touchstart', 200)
  touch(card, 'touchmove', 125)
  touch(card, 'touchend', 125)
  expect(screen.getByRole('dialog', { name: 'Excluir tarefa?' })).toBeVisible()
  expect(onDelete).not.toHaveBeenCalled()
  const cancel = screen.getByRole('button', { name: 'Cancelar' })
  touch(cancel, 'touchstart', 100)
  touch(cancel, 'touchend', 100)
  fireEvent.click(cancel, { detail: 1 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  expect(onDelete).not.toHaveBeenCalled()
})

it('locks native vertical scrolling even when the finger later moves horizontally', () => {
  const { card, onComplete, onDelete } = setup()
  touch(card, 'touchstart', 100)
  expect(touch(card, 'touchmove', 104, 130).defaultPrevented).toBe(false)
  expect(touch(card, 'touchmove', 190, 140).defaultPrevented).toBe(false)
  touch(card, 'touchend', 190, 140)
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('resets a cancelled native touch gesture and accepts a subsequent swipe', async () => {
  const { card, onComplete } = setup()
  touch(card, 'touchstart', 100)
  touch(card, 'touchmove', 170)
  touch(card, 'touchcancel', 170)
  expect(onComplete).not.toHaveBeenCalled()
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  touch(card, 'touchstart', 100)
  touch(card, 'touchend', 170)
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
})

it('cancels native multi-touch without completing a task', () => {
  const { card, onComplete } = setup()
  touch(card, 'touchstart', 100)
  touch(card, 'touchmove', 165)
  fireEvent.touchStart(card, {
    touches: [
      { identifier: 1, clientX: 165, clientY: 100 },
      { identifier: 2, clientX: 180, clientY: 100 },
    ],
  })
  touch(card, 'touchend', 165)
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  expect(onComplete).not.toHaveBeenCalled()
})

it('gives every card the same height and keeps edit off the card', () => {
  const second: Task = {
    ...task,
    id: 'task-2',
    title: 'Outra tarefa com um título bem maior do que o card comporta',
    description: 'Descrição longa que não deve aumentar a altura do card.',
    location: 'Rua das Flores, 100',
  }
  render(
    <TaskTimeline
      tasks={[task, second]}
      onComplete={jest.fn()}
      onDelete={jest.fn()}
    />,
  )
  const cards = screen.getAllByRole('article')
  expect(cards).toHaveLength(2)
  expect(cards[0]).toHaveClass('h-52')
  expect(cards[1]).toHaveClass('h-52')
  expect(
    screen.getAllByRole('img', { name: 'Responsável: Guilherme' }),
  ).toHaveLength(2)
  expect(
    screen.queryByRole('button', { name: 'Editar' }),
  ).not.toBeInTheDocument()
})

it('opens details on a native tap with small finger movement and has no details button', () => {
  const { card } = setup()
  touch(card, 'touchstart', 100)
  touch(card, 'touchmove', 104, 103)
  touch(card, 'touchend', 104, 103)
  fireEvent.click(card, { detail: 1 })
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Visualizar detalhes' }),
  ).not.toBeInTheDocument()
})

it('blocks the residual native click after a short swipe and accepts the next tap', () => {
  const { card, onComplete } = setup()
  touch(card, 'touchstart', 100)
  touch(card, 'touchmove', 125)
  touch(card, 'touchend', 125)
  fireEvent.click(card, { detail: 1 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onComplete).not.toHaveBeenCalled()
  touch(card, 'touchstart', 100)
  touch(card, 'touchend', 100)
  fireEvent.click(card, { detail: 1 })
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
})

it('keeps links separate from opening task details', () => {
  setup()
  const link = screen.getByRole('link', { name: /https:\/\/example\.test/ })
  link.addEventListener('click', (event) => event.preventDefault(), {
    once: true,
  })
  fireEvent.click(link, { detail: 1 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does not open details after a cancelled stationary touch', () => {
  const { card } = setup()
  touch(card, 'touchstart', 100)
  touch(card, 'touchcancel', 100)
  fireEvent.click(card, { detail: 1 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
