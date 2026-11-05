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
    pointerType: { value: 'touch' },
  })
  fireEvent(target, event)
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.setItem('colabora:swipe-tutorial', 'seen')
})

it('opens the existing details on click and restores focus when closed', async () => {
  const user = userEvent.setup()
  const { card, onComplete, onDelete } = setup()
  await user.click(screen.getByRole('heading', { name: task.title }))
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Descrição' })).toHaveTextContent(
    'Consultar https://example.test',
  )
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(card).toHaveFocus()
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it.each(['Enter', ' '])(
  'opens details with the %s key for a participant without edit permission',
  (key) => {
    const { card } = setup({
      ...task,
      permissions: {
        edit: false,
        assign: false,
        delete: false,
        changeStatus: true,
      },
    })
    fireEvent.keyDown(card, { key })
    expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument()
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
  fireEvent.click(card)
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
  fireEvent.click(card)
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
  fireEvent.click(card)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
  // A subsequent intentional tap remains usable.
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointerup', 100)
  fireEvent.click(card)
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
})

it('swipes reliably from the mobile handle after initial diagonal finger jitter', () => {
  const { card, onComplete, onDelete } = setup()
  const handle = card.querySelector('.colabora-swipe-handle')!
  expect(handle).toHaveClass('touch-none', 'md:hidden')
  pointer(handle, 'pointerdown', 100, 100)
  pointer(handle, 'pointermove', 107, 108)
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  pointer(handle, 'pointermove', 115, 110)
  expect(card).toHaveStyle({ transform: 'translateX(15px)' })
  pointer(handle, 'pointermove', 130, 112)
  expect(card).toHaveStyle({ transform: 'translateX(30px)' })
  pointer(handle, 'pointerup', 130, 112)
  fireEvent.click(card)
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  expect(onComplete).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it.each(['pointerup', 'pointercancel'])(
  'preserves vertical scrolling and ignores a trailing click after %s',
  (end) => {
    const { card, onComplete, onDelete } = setup()
    pointer(card, 'pointerdown', 100, 100)
    pointer(card, 'pointermove', 110, 150)
    pointer(card, 'pointermove', 180, 180)
    pointer(card, end, 180, 180)
    fireEvent.click(card)
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
  fireEvent.click(card)
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

it('keeps editing separate from opening details', async () => {
  const user = userEvent.setup()
  setup()
  await user.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.getByRole('dialog', { name: 'Editar tarefa' })).toBeVisible()
  expect(
    screen.queryByRole('dialog', { name: task.title }),
  ).not.toBeInTheDocument()
})

it('recovers from unexpected pointer capture loss without executing the action', () => {
  const { card, row, onComplete } = setup()
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointermove', 160)
  pointer(row, 'lostpointercapture', 160)
  pointer(card, 'pointerup', 160)
  fireEvent.click(card)
  expect(onComplete).not.toHaveBeenCalled()
  expect(card).toHaveStyle({ transform: 'translateX(0px)' })
  pointer(card, 'pointerdown', 100)
  pointer(card, 'pointerup', 100)
  fireEvent.click(card)
  expect(screen.getByRole('dialog', { name: task.title })).toBeVisible()
})

it('disables completion while saving, shows its error and allows a retry from details', async () => {
  const user = userEvent.setup()
  const { card, onComplete } = setup()
  let fail!: (reason: Error) => void
  onComplete.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject
    }),
  )
  await user.click(card)
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
