import { suggestTaskDate } from './suggest-task-date'

const morning = new Date(2026, 10, 4, 8, 0)

describe('suggestTaskDate', () => {
  it.each([
    ['Reunião às 9h', 9, 0],
    ['9h30 consulta', 9, 30],
    ['Consulta 09:45.', 9, 45],
    ['Revisar às 23h59', 23, 59],
    ['Reunião 9H', 9, 0],
  ])('recognizes a local clock time in %s', (title, hours, minutes) => {
    expect(suggestTaskDate(title, morning)).toEqual(
      new Date(2026, 10, 4, hours, minutes),
    )
  })

  it('schedules the next day if the clock time has passed', () => {
    expect(suggestTaskDate('Reunião 9h', new Date(2026, 10, 4, 10))).toEqual(
      new Date(2026, 10, 5, 9),
    )
  })

  it('respects explicit hoje and amanhã', () => {
    expect(suggestTaskDate('Reunião amanhã 9h', morning)).toEqual(
      new Date(2026, 10, 5, 9),
    )
    expect(
      suggestTaskDate('Reunião hoje 9h', new Date(2026, 10, 4, 10)),
    ).toEqual(new Date(2026, 10, 4, 9))
  })

  it('rolls over the calendar without changing local hours', () => {
    expect(suggestTaskDate('Revisão 0h', new Date(2026, 11, 31, 22))).toEqual(
      new Date(2027, 0, 1, 0),
    )
  })

  it.each([
    'Reunião',
    '25h',
    '9h99',
    '12:75',
    'código abc9h',
    'https://exemplo.com/9h',
  ])('does not infer a time from %s', (title) => {
    expect(suggestTaskDate(title, morning)).toBeNull()
  })
})
