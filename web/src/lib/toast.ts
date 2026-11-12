export type ToastMessage = {
  title: string
  description: string
  duration?: number | null
}

export function showToast(message: ToastMessage): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('colabora:toast', { detail: message }))
  }
}
