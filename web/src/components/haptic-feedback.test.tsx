import { fireEvent, render, screen } from '@testing-library/react'
import { HapticFeedback } from './haptic-feedback'
import { hapticFeedback } from '@/lib/haptics'

const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate')
let now = Date.now()
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue((now += 1000))
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: jest.fn(),
  })
})
afterEach(() => {
  jest.restoreAllMocks()
  if (original) Object.defineProperty(navigator, 'vibrate', original)
  else Reflect.deleteProperty(navigator, 'vibrate')
})

test('gives a light pulse when navigating, including clicks on button contents', () => {
  render(
    <>
      <HapticFeedback />
      <button>
        <span>Agenda</span>
      </button>
    </>,
  )
  fireEvent.click(screen.getByText('Agenda'))
  expect(navigator.vibrate).toHaveBeenCalledWith(12)
})
test('avoids repeated pulses for rapid interactions', () => {
  hapticFeedback()
  hapticFeedback()
  expect(navigator.vibrate).toHaveBeenCalledTimes(1)
})
test('plays confirmation feedback even immediately after a click', () => {
  hapticFeedback()
  hapticFeedback('success')
  hapticFeedback()
  expect(jest.mocked(navigator.vibrate).mock.calls).toEqual([[12], [20]])
})
test('does not vibrate disabled controls or page content', () => {
  render(
    <>
      <HapticFeedback />
      <button disabled>Salvar</button>
      <p>Descrição</p>
    </>,
  )
  fireEvent.click(screen.getByText('Salvar'))
  fireEvent.click(screen.getByText('Descrição'))
  expect(navigator.vibrate).not.toHaveBeenCalled()
})
test('removes its listener when unmounted', () => {
  const { unmount } = render(<HapticFeedback />)
  unmount()
  const button = document.createElement('button')
  document.body.append(button)
  fireEvent.click(button)
  expect(navigator.vibrate).not.toHaveBeenCalled()
  button.remove()
})
test('keeps actions usable when vibration is unsupported or blocked', () => {
  const click = jest.fn()
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: undefined,
  })
  render(
    <>
      <HapticFeedback />
      <button onClick={click}>Hoje</button>
    </>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
  expect(click).toHaveBeenCalledTimes(1)
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: () => {
      throw new Error('Blocked')
    },
  })
  expect(() => hapticFeedback('success')).not.toThrow()
})

test('allows a pulse for every threshold entry even during rapid reentry', () => {
  hapticFeedback('threshold')
  hapticFeedback('threshold')
  expect(jest.mocked(navigator.vibrate).mock.calls).toEqual([[12], [12]])
})
