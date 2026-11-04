import { useEffect } from 'react'
import { hapticFeedback } from '@/lib/haptics'

export function HapticFeedback() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      const control = event.target.closest(
        'button, a[href], [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], select',
      )
      if (!control || control.matches(':disabled, [aria-disabled="true"]'))
        return
      hapticFeedback()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
