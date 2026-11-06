import { isTimedTask, taskWindow } from './task-kind'

const start = '2026-11-06T20:00:00.000Z'
const end = '2026-11-06T20:40:00.000Z'
const due = '2026-11-06T20:00:00.000Z'

it('keeps the finish instant of a timed task', () => {
  expect(
    taskWindow({
      timed: true,
      dueDate: null,
      startedAt: start,
      completedAt: end,
    }),
  ).toEqual({ startDate: start, endDate: end })
  expect(isTimedTask({ timed: true, dueDate: null, startedAt: null })).toBe(
    true,
  )
})

it('shows a scheduled task from its due date until it is finished', () => {
  expect(
    taskWindow({
      timed: false,
      dueDate: due,
      startedAt: start,
      completedAt: end,
    }),
  ).toEqual({ startDate: due, endDate: end })
  expect(isTimedTask({ timed: false, dueDate: due, startedAt: start })).toBe(
    false,
  )
})

it('leaves a running timed task without an end', () => {
  expect(
    taskWindow({
      timed: true,
      dueDate: null,
      startedAt: start,
      completedAt: null,
    }),
  ).toEqual({ startDate: start, endDate: null })
})
