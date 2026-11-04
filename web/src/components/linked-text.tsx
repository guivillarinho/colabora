import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

export function LinkedText({ children }: { children: string }) {
  const parts: ReactNode[] = []
  let cursor = 0
  const links = children.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"'`]+/giu)

  for (const match of links) {
    const start = match.index
    let text = match[0].replace(/[.,!?;:]+$/, '')
    // Keep closing parentheses that belong to the URL itself.
    while (
      text.endsWith(')') &&
      text.split(')').length > text.split('(').length
    )
      text = text.slice(0, -1)
    const href = text.toLowerCase().startsWith('www.')
      ? `https://${text}`
      : text
    try {
      const url = new URL(href)
      if (!['http:', 'https:'].includes(url.protocol)) continue
    } catch {
      continue
    }
    parts.push(children.slice(cursor, start))
    parts.push(
      <a
        key={start}
        className="rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 outline-none transition-colors hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {text}
        <ExternalLink
          aria-hidden="true"
          className="ml-1 inline size-3 align-baseline"
        />
        <span className="sr-only"> (abre em nova aba)</span>
      </a>,
    )
    cursor = start + text.length
  }
  parts.push(children.slice(cursor))
  return <>{parts}</>
}
