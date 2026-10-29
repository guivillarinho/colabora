import { formatDuration } from './format-duration'

describe('formatDuration', () => {
  it('formats minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45 min')
  })

  it('formats exact hours', () => {
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(120)).toBe('2 h')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1 h 30 min')
  })
})
