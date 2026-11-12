export type ToastMessage = {
  title: string
  description: string
}

export function showToast(message: ToastMessage): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('colabora:toast', { detail: message }))
  }
}
