let lastFeedback = -Infinity

export function hapticFeedback(
  kind: 'light' | 'success' | 'threshold' = 'light',
): void {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  )
    return
  const now = Date.now()
  if (kind === 'light' && now - lastFeedback < 80) return
  try {
    navigator.vibrate(kind === 'success' ? 20 : 12)
    lastFeedback = now
  } catch {
    // Haptics are optional; a browser restriction must never interrupt an action.
  }
}
