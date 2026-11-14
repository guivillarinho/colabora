export type ToastMessage = {
  title: string
  itemTitle?: string
  description?: string
  variant?: 'success'
  duration?: number | null
}

export function showToast(message: ToastMessage): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('colabora:toast', { detail: message }))
  }
}
