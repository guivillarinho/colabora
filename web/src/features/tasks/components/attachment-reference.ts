const storedFile =
  /^\/uploads\/agenda\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i

export function attachmentReference(name: string, url: string): string {
  const label = name.replaceAll('||', ' ').trim() || 'arquivo'
  return `${label}||${url}`
}

export function parseAttachment(reference: string | null | undefined): {
  name: string
  url: string | null
} {
  if (!reference) return { name: '', url: null }
  const separator = reference.indexOf('||')
  if (separator === -1) return { name: reference, url: null }
  const name = reference.slice(0, separator)
  const url = reference.slice(separator + 2)
  if (!name || !storedFile.test(url))
    return { name: name || reference, url: null }
  return { name, url }
}
