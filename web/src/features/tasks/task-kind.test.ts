import { isTimedTask, taskWindow } from './task-kind'

const start = '2026-11-06T20:00:00.000Z'
const end = '2026-11-06T20:40:00.000Z'
const due = '2026-11-06T20:00:00.000Z'

it('keeps the execution interval of a finished timed task', () => {
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

it('includes the completion day in the scheduled task interval', () => {
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

it('puts an unscheduled completed task in the calendar', () => {
  expect(
    taskWindow({
      timed: false,
      dueDate: null,
      startedAt: null,
      completedAt: end,
    }),
  ).toEqual({ startDate: end, endDate: end })
})
it('does not invert a calendar interval when finishing before the deadline', () => {
  expect(
    taskWindow({
      timed: false,
      dueDate: '2026-11-09T20:00:00.000Z',
      startedAt: null,
      completedAt: end,
    }),
  ).toEqual({ startDate: end, endDate: end })
})
