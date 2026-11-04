let lastFeedback = -Infinity

export function hapticFeedback(kind: 'light' | 'success' = 'light'): void {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  )
    return
  const now = Date.now()
  if (now - lastFeedback < 80) return
  try {
    navigator.vibrate(kind === 'success' ? 20 : 8)
    lastFeedback = now
  } catch {
    // Haptics are optional; a browser restriction must never interrupt an action.
  }
}
