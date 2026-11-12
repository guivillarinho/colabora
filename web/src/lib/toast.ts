export function showToast(message: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('colabora:toast', { detail: { message } }),
    )
  }
}

